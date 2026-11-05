import type {
  AppliedTransaction,
  DiagnosticItem,
  DocToShell,
  EditCommand,
  Manifest,
} from "@ombrique/protocol";
import { manifestSchema } from "@ombrique/protocol";
import { readFileSync, watch, type FSWatcher } from "node:fs";
import { History, type HistoryEntryView } from "./history";
import {
  hashText,
  listDesignFiles,
  MANIFEST_NAME,
  readManifest,
  removeFile,
  resolveInside,
  writeFileAtomic,
} from "./paths";
import {
  currentVersions,
  loadProject,
  planCommands,
  rebuildIndex,
  type ProjectSnapshot,
} from "./project";

export class TransactionRejectedError extends Error {
  constructor(message = "transaction rejected") {
    super(message);
    this.name = "TransactionRejectedError";
  }
}

export interface DocumentServiceOptions {
  emit?: (message: DocToShell) => void;
  watchInterval?: number;
}

interface CommitOptions {
  before: Map<string, string>;
  after: Map<string, string>;
  files: string[];
  actor: string;
  deletedPageFile?: string;
  recordHistory: boolean;
  emitDiagnostics: boolean;
}

export class DocumentService {
  private snapshot: ProjectSnapshot | null = null;
  private history = new History();
  private watcher: FSWatcher | null = null;
  private selfWrites = new Map<string, string>();
  private send: (message: DocToShell) => void;
  private writeQueue: Array<() => void> = [];
  private pendingEmits: DocToShell[] = [];
  private writing = false;
  private counter = 0;
  private externalTimer: NodeJS.Timeout | undefined;

  constructor(options: DocumentServiceOptions = {}) {
    this.send = options.emit ?? (() => {});
  }

  get root(): string {
    if (!this.snapshot) throw new Error("no project open");
    return this.snapshot.root;
  }

  get manifest(): Manifest {
    if (!this.snapshot) throw new Error("no project open");
    return this.snapshot.manifest;
  }

  get project(): ProjectSnapshot {
    if (!this.snapshot) throw new Error("no project open");
    return this.snapshot;
  }

  open(root: string): Manifest {
    this.close();
    this.snapshot = loadProject(root);
    this.history.clear();
    this.startWatching();
    this.emit({
      kind: "projectOpened",
      root,
      manifest: this.snapshot.manifest,
    });
    this.emitDiagnostics();
    return this.snapshot.manifest;
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
    clearTimeout(this.externalTimer);
    this.externalTimer = undefined;
    this.writeQueue = [];
    this.pendingEmits = [];
    this.snapshot = null;
    this.history.clear();
  }

  private emit(message: DocToShell): void {
    if (this.writing) {
      this.pendingEmits.push(message);
      return;
    }
    this.send(message);
  }

  private enqueueWrite<T>(operation: () => T): T {
    const slot: { result?: T; error?: unknown; failed?: boolean } = {};
    this.writeQueue.push(() => {
      try {
        slot.result = operation();
      } catch (error) {
        slot.failed = true;
        slot.error = error;
      }
    });
    this.drainWrites();
    if (slot.failed) throw slot.error;
    return slot.result as T;
  }

  private drainWrites(): void {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.writeQueue.length > 0) {
        const operation = this.writeQueue.shift();
        operation?.();
      }
    } finally {
      this.writing = false;
    }
    const pending = this.pendingEmits.splice(0);
    for (const message of pending) this.send(message);
  }

  apply(
    commands: EditCommand[],
    _baseVersions: string[],
    actor = "designer",
  ): AppliedTransaction {
    return this.enqueueWrite(() => this.applyCommands(commands, actor));
  }

  private applyCommands(
    commands: EditCommand[],
    actor: string,
  ): AppliedTransaction {
    const snapshot = this.project;
    const files = this.filesFor(commands, snapshot);
    this.refreshExternal(files);
    const outcome = planCommands(snapshot, commands);
    if (!outcome) {
      this.emit({
        kind: "commandFailed",
        message: "节点已不存在或代码已被改动,请重新选择后再操作",
      });
      throw new TransactionRejectedError();
    }

    const before = new Map<string, string>();
    const after = new Map<string, string>();
    for (const file of outcome.changedFiles) {
      before.set(file, snapshot.files.get(file)?.text ?? "");
      after.set(file, outcome.texts.get(file) ?? "");
    }

    return this.commit({
      before,
      after,
      files: outcome.changedFiles,
      actor,
      deletedPageFile: outcome.deletedPageFile,
      recordHistory: outcome.changedFiles.length > 0,
      emitDiagnostics: false,
    });
  }

  undo(): AppliedTransaction | null {
    return this.enqueueWrite(() => {
      const entry = this.history.undo();
      if (!entry) return null;
      return this.commit({
        before: entry.after,
        after: entry.before,
        files: entry.files,
        actor: "designer",
        recordHistory: false,
        emitDiagnostics: true,
      });
    });
  }

  redo(): AppliedTransaction | null {
    return this.enqueueWrite(() => {
      const entry = this.history.redo();
      if (!entry) return null;
      return this.commit({
        before: entry.before,
        after: entry.after,
        files: entry.files,
        actor: "designer",
        recordHistory: false,
        emitDiagnostics: true,
      });
    });
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  private commit(options: CommitOptions): AppliedTransaction {
    const snapshot = this.project;
    const conflict = this.verifySnapshot(
      snapshot,
      options.files,
      options.deletedPageFile,
    );
    if (conflict) {
      const message = `文件 ${conflict} 已被外部修改,请刷新后重试`;
      this.emit({ kind: "commandFailed", message });
      throw new TransactionRejectedError(message);
    }

    for (const file of options.files) {
      const text = options.after.get(file) ?? "";
      const absolute = resolveInside(snapshot.root, file);
      if (text === "") {
        removeFile(absolute);
        snapshot.files.delete(file);
        this.selfWrites.delete(file);
      } else {
        writeFileAtomic(absolute, text);
        this.setFileState(snapshot, file, text);
      }
    }

    if (
      options.deletedPageFile &&
      options.deletedPageFile !== MANIFEST_NAME &&
      !options.files.includes(options.deletedPageFile)
    ) {
      removeFile(resolveInside(snapshot.root, options.deletedPageFile));
      snapshot.files.delete(options.deletedPageFile);
      this.selfWrites.delete(options.deletedPageFile);
    }

    const manifestText = options.after.get(MANIFEST_NAME);
    if (manifestText)
      snapshot.manifest = manifestSchema.parse(JSON.parse(manifestText));
    rebuildIndex(snapshot);

    if (options.recordHistory) {
      this.history.record({
        before: options.before,
        after: options.after,
        files: options.files,
        actor: options.actor,
      });
    }

    this.counter += 1;
    const transaction: AppliedTransaction = {
      id: `t${this.counter}`,
      changedFiles: options.files,
      versions: currentVersions(snapshot, options.files),
      origin: options.actor === "designer" ? "designer" : "agent",
      actor: options.actor,
    };
    this.emit({ kind: "transactionApplied", transaction });
    this.emitHistory();
    this.emitManifest();
    if (options.emitDiagnostics) this.emitDiagnostics();
    return transaction;
  }

  private verifySnapshot(
    snapshot: ProjectSnapshot,
    files: string[],
    deletedPageFile?: string,
  ): string | null {
    const checked = [...files];
    if (
      deletedPageFile &&
      deletedPageFile !== MANIFEST_NAME &&
      !checked.includes(deletedPageFile)
    )
      checked.push(deletedPageFile);
    for (const file of checked) {
      const state = snapshot.files.get(file);
      let diskText: string | null = null;
      try {
        diskText = readFileSync(resolveInside(snapshot.root, file), "utf8");
      } catch {
        diskText = null;
      }
      if (!state) {
        if (diskText !== null) return file;
        continue;
      }
      if (diskText === null) return file;
      if (hashText(diskText) !== hashText(state.text)) return file;
    }
    return null;
  }

  private setFileState(
    snapshot: ProjectSnapshot,
    file: string,
    text: string,
  ): void {
    const version = hashText(text);
    this.selfWrites.set(file, version);
    snapshot.files.set(file, { text, version });
  }

  restoreVersion(
    targetFiles: Record<string, string>,
    actor = "designer",
  ): AppliedTransaction | null {
    return this.enqueueWrite(() => this.restoreVersionNow(targetFiles, actor));
  }

  private restoreVersionNow(
    targetFiles: Record<string, string>,
    actor: string,
  ): AppliedTransaction | null {
    const snapshot = this.project;
    const before = new Map<string, string>();
    const after = new Map<string, string>();
    const touched: string[] = [];

    const currentFileKeys = new Set(snapshot.files.keys());
    const targetFileKeys = new Set(Object.keys(targetFiles));
    const allFiles = new Set([...currentFileKeys, ...targetFileKeys]);

    for (const file of allFiles) {
      if (file === "comments.json") continue;
      const prev = snapshot.files.get(file)?.text ?? "";
      const next = targetFiles[file];

      if (next === undefined) {
        if (currentFileKeys.has(file)) {
          before.set(file, prev);
          after.set(file, "");
          touched.push(file);
        }
      } else if (!currentFileKeys.has(file)) {
        before.set(file, "");
        after.set(file, next);
        touched.push(file);
      } else if (prev !== next) {
        before.set(file, prev);
        after.set(file, next);
        touched.push(file);
      }
    }

    if (touched.length === 0) return null;
    return this.commit({
      before,
      after,
      files: touched,
      actor,
      recordHistory: true,
      emitDiagnostics: true,
    });
  }

  historyEntries(): readonly HistoryEntryView[] {
    return this.history.entries();
  }

  historyEntry(id: string): HistoryEntryView | null {
    return this.history.get(id);
  }

  private filesFor(
    commands: EditCommand[],
    snapshot: ProjectSnapshot,
  ): string[] {
    const files = new Set<string>();
    for (const command of commands) {
      if (command.kind === "addPage") continue;
      if (command.kind === "renamePage" || command.kind === "deletePage") {
        files.add(MANIFEST_NAME);
        continue;
      }
      if (command.kind === "setSharedStyle") {
        files.add(command.file);
        continue;
      }
      if (command.kind === "setTokenValue" || command.kind === "createToken") {
        files.add("tokens.css");
        continue;
      }
      if (
        command.kind === "addTokenMode" ||
        command.kind === "renameTokenMode" ||
        command.kind === "deleteTokenMode"
      ) {
        files.add("tokens.css");
        if (command.kind !== "addTokenMode") {
          for (const element of snapshot.index.elements.values()) {
            if (
              element.tag === "Frame" &&
              element.attrs["data-mode"]?.value === command.name
            )
              files.add(element.ref.file);
          }
        }
        continue;
      }
      if (command.kind === "createComponent") {
        files.add(command.target.file);
        files.add(`components/${command.name}.tsx`);
        continue;
      }
      if (command.kind === "createVariantSet") {
        for (const target of command.targets) files.add(target.file);
        files.add(`components/${command.name}.tsx`);
        continue;
      }
      if (command.kind === "detachInstance") {
        files.add(command.target.file);
        continue;
      }
      if (command.kind === "groupNodes") {
        files.add(command.pageFile);
        for (const target of command.targets) files.add(target.file);
        if (command.parent) files.add(command.parent.file);
        continue;
      }
      if (command.kind === "createNodes") {
        files.add(command.pageFile);
        if (command.parent) files.add(command.parent.file);
        continue;
      }
      if (command.kind === "reparent") {
        files.add(command.pageFile);
        files.add(command.target.file);
        if (command.parent) files.add(command.parent.file);
        continue;
      }
      if (command.kind === "deleteNodes") {
        for (const target of command.targets) files.add(target.file);
        continue;
      }
      files.add(command.target.file);
    }
    for (const file of files) {
      if (!snapshot.files.has(file) && file !== MANIFEST_NAME)
        files.delete(file);
    }
    return [...files];
  }

  private startWatching(): void {
    const snapshot = this.project;
    try {
      this.watcher = watch(
        snapshot.root,
        { recursive: true },
        (_event, filename) => {
          if (!filename) return;
          const file = filename.toString().split("\\").join("/");
          if (
            file.startsWith("node_modules") ||
            file.includes("/node_modules/")
          )
            return;
          if (file.endsWith(".ombrique-tmp") || file.includes(".ombrique-tmp-"))
            return;
          this.queueExternalCheck(file);
        },
      );
    } catch {
      this.watcher = null;
    }
  }

  private queueExternalCheck(file: string): void {
    clearTimeout(this.externalTimer);
    this.externalTimer = setTimeout(() => {
      this.externalTimer = undefined;
      this.refreshExternal([file]);
    }, 60);
  }

  refreshExternal(files: string[]): string[] {
    const snapshot = this.snapshot;
    if (!snapshot) return [];
    const changed: string[] = [];
    const staleIds: string[] = [];
    for (const file of files) {
      const absolute = resolveInside(snapshot.root, file);
      let text: string;
      try {
        text = readFileSync(absolute, "utf8");
      } catch {
        if (snapshot.files.delete(file)) {
          changed.push(file);
          this.selfWrites.delete(file);
          staleIds.push(...this.history.invalidate([file]));
        }
        continue;
      }
      const version = hashText(text);
      const known = snapshot.files.get(file);
      if (known && known.version === version) continue;
      if (this.selfWrites.get(file) === version) {
        this.setFileState(snapshot, file, text);
        continue;
      }
      this.selfWrites.delete(file);
      snapshot.files.set(file, { text, version });
      changed.push(file);
      staleIds.push(...this.history.invalidate([file]));
    }
    if (changed.length === 0) return [];
    try {
      snapshot.manifest = readManifest(snapshot.root);
    } catch {
      void 0;
    }
    rebuildIndex(snapshot);
    this.emit({
      kind: "transactionApplied",
      transaction: {
        id: `ext${++this.counter}`,
        changedFiles: changed,
        versions: currentVersions(snapshot, changed),
        origin: "external",
      },
    });
    if (staleIds.length > 0) this.emitHistory();
    this.emitManifest();
    this.emitDiagnostics();
    return changed;
  }

  refreshAll(): string[] {
    const snapshot = this.snapshot;
    if (!snapshot) return [];
    return this.refreshExternal(listDesignFiles(snapshot.root));
  }

  diagnostics(): DiagnosticItem[] {
    const snapshot = this.snapshot;
    if (!snapshot) return [];
    const items: DiagnosticItem[] = [];
    const manifest = snapshot.manifest;
    const files = new Set(manifest.pages.map((page) => page.file));
    for (const file of files) {
      if (!snapshot.files.has(file)) {
        items.push({
          file,
          message: `清单引用的页面文件不存在:${file}`,
          severity: "error",
        });
      }
    }
    for (const [file, state] of snapshot.files) {
      if (
        file.endsWith(".tsx") &&
        !file.startsWith("pages/") &&
        !file.startsWith("components/")
      ) {
        items.push({
          file,
          message: "文件不在 pages/ 或 components/ 目录下,不会被当作设计稿入口",
          severity: "warning",
        });
      }
      if (state.text.length === 0) {
        items.push({ file, message: "文件为空", severity: "warning" });
      }
    }
    return items;
  }

  emitDiagnostics(): void {
    this.emit({ kind: "diagnostics", items: this.diagnostics() });
  }

  emitHistory(): void {
    this.emit({
      kind: "historyChanged",
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
  }

  emitManifest(): void {
    this.emit({ kind: "manifestChanged", manifest: this.project.manifest });
  }

  readFile(file: string): string | null {
    return this.snapshot?.files.get(file)?.text ?? null;
  }

  writeRaw(file: string, text: string): void {
    this.enqueueWrite(() => this.writeRawNow(file, text));
  }

  private writeRawNow(file: string, text: string): void {
    const snapshot = this.project;
    writeFileAtomic(resolveInside(snapshot.root, file), text);
    this.setFileState(snapshot, file, text);
    rebuildIndex(snapshot);
  }
}
