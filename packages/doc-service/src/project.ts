import type { EditCommand, Manifest, NodeRef } from "@ombrique/protocol";
import {
  buildIndex,
  locateByPath,
  planPatch,
  applyEdits,
} from "@ombrique/source";
import type { DesignIndex, TextEdit } from "@ombrique/source";
import {
  hashText,
  listDesignFiles,
  readManifest,
  resolveInside,
} from "./paths";
import { readFileSync } from "node:fs";

export interface FileState {
  text: string;
  version: string;
}

export interface ProjectSnapshot {
  root: string;
  manifest: Manifest;
  files: Map<string, FileState>;
  index: DesignIndex;
}

export function loadProject(root: string): ProjectSnapshot {
  const manifest = readManifest(root);
  const files = new Map<string, FileState>();
  for (const file of listDesignFiles(root)) {
    const text = readFileSync(resolveInside(root, file), "utf8");
    files.set(file, { text, version: hashText(text) });
  }
  return {
    root,
    manifest,
    files,
    index: buildIndex(toTextRecord(files)),
  };
}

export function toTextRecord(
  files: Map<string, FileState>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [file, state] of files) out[file] = state.text;
  return out;
}

export function reloadFile(snapshot: ProjectSnapshot, file: string): void {
  const text = readFileSync(resolveInside(snapshot.root, file), "utf8");
  snapshot.files.set(file, { text, version: hashText(text) });
}

export function rebuildIndex(snapshot: ProjectSnapshot): void {
  snapshot.index = buildIndex(toTextRecord(snapshot.files));
}

export function versionOf(
  snapshot: ProjectSnapshot,
  file: string,
): string | null {
  return snapshot.files.get(file)?.version ?? null;
}

export function currentVersions(
  snapshot: ProjectSnapshot,
  files: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of files) {
    const version = versionOf(snapshot, file);
    if (version) out[file] = version;
  }
  return out;
}

export function reanchor(
  index: DesignIndex,
  text: string | undefined,
  ref: NodeRef,
): NodeRef | null {
  if (ref.path && ref.path.length > 0) {
    const element = locateByPath(index, ref.file, ref.path);
    return element
      ? {
          file: element.ref.file,
          start: element.ref.start,
          end: element.ref.end,
          path: element.path,
        }
      : null;
  }
  if (text === undefined) return null;
  if (ref.end > text.length) return null;
  return ref;
}

export function reanchorCommand(
  index: DesignIndex,
  texts: Map<string, string>,
  command: EditCommand,
): EditCommand | null {
  const anchor = (ref: NodeRef) => reanchor(index, texts.get(ref.file), ref);
  if (
    command.kind === "addPage" ||
    command.kind === "renamePage" ||
    command.kind === "deletePage" ||
    command.kind === "setSharedStyle" ||
    command.kind === "setTokenValue" ||
    command.kind === "createToken"
  ) {
    return command;
  }
  if (command.kind === "deleteNodes") {
    const targets: NodeRef[] = [];
    for (const target of command.targets) {
      const anchored = anchor(target);
      if (!anchored) return null;
      targets.push(anchored);
    }
    return { ...command, targets };
  }
  if (command.kind === "groupNodes") {
    const targets: NodeRef[] = [];
    for (const target of command.targets) {
      const anchored = anchor(target);
      if (!anchored) return null;
      targets.push(anchored);
    }
    const parent = command.parent ? anchor(command.parent) : null;
    if (command.parent && !parent) return null;
    return { ...command, targets, parent };
  }
  if (command.kind === "reparent") {
    const target = anchor(command.target);
    const parent = command.parent ? anchor(command.parent) : null;
    if (!target || (command.parent && !parent)) return null;
    return { ...command, target, parent };
  }
  if (command.kind === "createNodes") {
    const parent = command.parent ? anchor(command.parent) : null;
    if (command.parent && !parent) return null;
    return { ...command, parent };
  }
  const target = anchor(command.target);
  if (!target) return null;
  return { ...command, target };
}

export interface PlanOutcome {
  texts: Map<string, string>;
  changedFiles: string[];
  deletedPageFile?: string;
}

export function planCommands(
  snapshot: ProjectSnapshot,
  commands: EditCommand[],
): PlanOutcome | null {
  const working = new Map<string, string>();
  for (const [file, state] of snapshot.files) working.set(file, state.text);
  const before = new Map(working);
  let deletedPageFile: string | undefined;
  let index = buildIndex(Object.fromEntries(working));

  for (const command of commands) {
    const anchored = reanchorCommand(index, working, command);
    if (!anchored) return null;
    const plan = planPatch(index, anchored);
    const byFile = new Map<string, TextEdit[]>();
    for (const edit of plan.edits) {
      const list = byFile.get(edit.file) ?? [];
      list.push(edit);
      byFile.set(edit.file, list);
    }
    for (const [file, edits] of byFile) {
      const current = working.get(file);
      if (current === undefined) {
        working.set(
          file,
          applyEdits(
            "",
            edits.map((edit) => ({ ...edit, start: 0, end: 0 })),
          ),
        );
        continue;
      }
      working.set(file, applyEdits(current, edits));
    }
    if (plan.meta?.deletedPageFile) deletedPageFile = plan.meta.deletedPageFile;
    index = buildIndex(Object.fromEntries(working));
  }

  const changedFiles = [...working.keys()].filter(
    (file) => working.get(file) !== before.get(file),
  );
  return { texts: working, changedFiles, deletedPageFile };
}
