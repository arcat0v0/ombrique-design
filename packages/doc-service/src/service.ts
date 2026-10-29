import type {
  AppliedTransaction,
  DiagnosticItem,
  DocToShell,
  EditCommand,
  Manifest,
} from "@ombrique/protocol";
import { manifestSchema } from "@ombrique/protocol";
import { readFileSync, watch, type FSWatcher } from "node:fs";
import { History } from "./history";
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

export interface DocumentServiceOptions {
  emit?: (message: DocToShell) => void;
  watchInterval?: number;
}

export class DocumentService {
  private snapshot: ProjectSnapshot | null = null;
  private history = new History();
  private watcher: FSWatcher | null = null;
  private selfWrites = new Map<string, string>();
  private emit: (message: DocToShell) => void;
  private counter = 0;
  private externalTimer: NodeJS.Timeout | undefined;

  constructor(options: DocumentServiceOptions = {}) {
    this.emit = options.emit ?? (() => {});
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
    this.snapshot = null;
    this.history.clear();
  }

  apply(commands: EditCommand[], _baseVersions: string[]): AppliedTransaction {
    const snapshot = this.project;
    const files = this.filesFor(commands, snapshot);
    this.refreshExternal(files);
    const outcome = planCommands(snapshot, commands);
    if (!outcome) {
      this.emit({
        kind: "commandFailed",
        message: "节点已不存在或代码已被改动,请重新选择后再操作",
      });
      throw new Error("command could not be applied to the current sources");
    }

    const before = new Map<string, string>();
    for (const file of outcome.changedFiles) {
      before.set(file, snapshot.files.get(file)?.text ?? "");
    }

    for (const file of outcome.changedFiles) {
      const text = outcome.texts.get(file) ?? "";
      const absolute = resolveInside(snapshot.root, file);
      writeFileAtomic(absolute, text);
      this.selfWrites.set(file, hashText(text));
      snapshot.files.set(file, { text, version: hashText(text) });
    }

    if (outcome.deletedPageFile) {
      const file = outcome.deletedPageFile;
      if (file !== MANIFEST_NAME) {
        removeFile(resolveInside(snapshot.root, file));
        snapshot.files.delete(file);
        this.selfWrites.delete(file);
      }
    }

    const manifestText = outcome.texts.get(MANIFEST_NAME);
    if (manifestText) {
      this.selfWrites.set(MANIFEST_NAME, hashText(manifestText));
      snapshot.manifest = manifestSchema.parse(JSON.parse(manifestText));
    }

    rebuildIndex(snapshot);

    const after = new Map<string, string>();
    for (const file of outcome.changedFiles) {
      after.set(file, outcome.texts.get(file) ?? "");
    }
    this.history.record({ before, after, files: outcome.changedFiles });

    this.counter += 1;
    const transaction: AppliedTransaction = {
      id: `t${this.counter}`,
      changedFiles: outcome.changedFiles,
      versions: currentVersions(snapshot, outcome.changedFiles),
      origin: "designer",
    };
    this.emit({ kind: "transactionApplied", transaction });
    this.emitHistory();
    this.emitManifest();
    return transaction;
  }

  undo(): AppliedTransaction | null {
    const entry = this.history.undo();
    if (!entry) return null;
    return this.restore(entry.before, entry.files);
  }

  redo(): AppliedTransaction | null {
    const entry = this.history.redo();
    if (!entry) return null;
    return this.restore(entry.after, entry.files);
  }

  private restore(
    texts: Map<string, string>,
    files: string[],
  ): AppliedTransaction {
    const snapshot = this.project;
    for (const [file, text] of texts) {
      writeFileAtomic(resolveInside(snapshot.root, file), text);
      this.selfWrites.set(file, hashText(text));
      snapshot.files.set(file, { text, version: hashText(text) });
    }
    const manifestText = texts.get(MANIFEST_NAME);
    if (manifestText)
      snapshot.manifest = manifestSchema.parse(JSON.parse(manifestText));
    rebuildIndex(snapshot);
    this.counter += 1;
    const transaction: AppliedTransaction = {
      id: `t${this.counter}`,
      changedFiles: files,
      versions: currentVersions(snapshot, files),
      origin: "designer",
    };
    this.emit({ kind: "transactionApplied", transaction });
    this.emitHistory();
    this.emitManifest();
    this.emitDiagnostics();
    return transaction;
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
      if (command.kind === "createComponent") {
        files.add(command.target.file);
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
    const droppedIds: string[] = [];
    for (const file of files) {
      const absolute = resolveInside(snapshot.root, file);
      let text: string;
      try {
        text = readFileSync(absolute, "utf8");
      } catch {
        if (snapshot.files.delete(file)) {
          changed.push(file);
          this.selfWrites.delete(file);
        }
        continue;
      }
      const version = hashText(text);
      const known = snapshot.files.get(file);
      if (known && known.version === version) continue;
      if (this.selfWrites.get(file) === version) {
        snapshot.files.set(file, { text, version });
        continue;
      }
      snapshot.files.set(file, { text, version });
      changed.push(file);
      droppedIds.push(...this.history.invalidate([file]));
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
    if (droppedIds.length > 0) this.emitHistory();
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
    const snapshot = this.project;
    writeFileAtomic(resolveInside(snapshot.root, file), text);
    this.selfWrites.set(file, hashText(text));
    snapshot.files.set(file, { text, version: hashText(text) });
    rebuildIndex(snapshot);
  }
}
