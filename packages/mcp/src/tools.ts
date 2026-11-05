import { createHash } from "node:crypto";
import { basename } from "node:path";
import type {
  AgentPresenceTarget,
  AppliedTransaction,
  EditCommand,
  ExportFormat,
  ExportNodeRequest,
  NodeRef,
} from "@ombrique/protocol";
import { nodeRefSchema } from "@ombrique/protocol";
import type { HandleEditCommand, HandleRef } from "./commands";
import type { AgentSocketClient } from "./client";
import { DIALECT_DOC } from "./dialect";
import { ToolError } from "./errors";
import { isRecord } from "./guards";
import { HandleLimitError, HandleRegistry, type HandleRecord } from "./handles";

export interface DocumentToolsOptions {
  maxHandles?: number;
}

export interface StatePage {
  file: string;
  name: string;
}

export interface ReadStateResult {
  projectRoot: string | null;
  pages: StatePage[];
  versions: Record<string, string>;
  selection: null;
  selectionAvailable: false;
  handleCount: number;
}

export interface TreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreeNode {
  handle: string;
  tag: string;
  name: string;
  path: number[];
  rect: TreeRect;
  children: TreeNode[];
}

export interface ReadTreeResult {
  page: string;
  nodes: TreeNode[];
  handleCount: number;
}

export interface ReadNodeResult {
  handle: string;
  file: string;
  path: number[];
  tag: string;
  name: string;
  rect: TreeRect;
  style: Record<string, unknown>[];
  props: Record<string, unknown>[];
  attrs: Record<string, unknown>[];
  text: string;
}

export interface SelectResult {
  ok: boolean;
  actor: string;
  color: string;
  targets: AgentPresenceTarget[];
}

export interface ScreenshotResult {
  mimeType: "image/png" | "image/jpeg";
  data: string;
  width: number;
  height: number;
}

export interface ExportResult {
  ok: boolean;
  written?: string[];
}

export interface ExportFileInput {
  handle?: string;
  file?: string;
  path?: number[];
  name?: string;
  format?: ExportFormat;
  scale?: number;
}

const STRUCTURAL_COMMANDS: Record<string, true> = {
  createNodes: true,
  deleteNodes: true,
  reparent: true,
  groupNodes: true,
  ungroupNode: true,
  duplicateNode: true,
  createComponent: true,
  createVariantSet: true,
  detachInstance: true,
  flattenBoolean: true,
};

const PAGE_COMMANDS: Record<string, true> = {
  addPage: true,
  renamePage: true,
  deletePage: true,
};

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function attrValue(attrs: Record<string, unknown>[], key: string): unknown {
  const entry = attrs.find((attr) => attr.key === key);
  return entry?.value;
}

function collectActivityTargets(
  commands: EditCommand[],
): AgentPresenceTarget[] {
  const targets = new Map<string, AgentPresenceTarget>();
  const add = (ref: NodeRef | AgentPresenceTarget | null | undefined) => {
    if (!ref) return;
    const path = ref.path ?? [];
    const key = `${ref.file}:${path.join("/")}`;
    targets.set(key, { file: ref.file, path: [...path] });
  };
  for (const command of commands) {
    if ("target" in command) add(command.target);
    if ("targets" in command) for (const target of command.targets) add(target);
    if ("parent" in command) {
      add(command.parent);
      if (
        !command.parent &&
        (command.kind === "createNodes" ||
          command.kind === "reparent" ||
          command.kind === "groupNodes")
      )
        add({ file: command.pageFile, path: [] });
    }
  }
  return [...targets.values()];
}

function countLayerNodes(layers: readonly unknown[]): number {
  let count = 0;
  const visit = (value: unknown) => {
    if (!isRecord(value)) return;
    count += 1;
    if (Array.isArray(value.children))
      for (const child of value.children) visit(child);
  };
  for (const layer of layers) visit(layer);
  return count;
}

function fragmentHashOfElement(element: Record<string, unknown>): string {
  const stable = JSON.stringify({
    ref: element.ref,
    tag: element.tag,
    name: element.name,
    text: element.text,
    style: element.style,
    props: element.props,
    attrs: element.attrs,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function rectFromElement(element: Record<string, unknown>): TreeRect {
  const props = arrayOfRecords(element.props);
  const style = arrayOfRecords(element.style);
  const x =
    numberFrom(attrValue(props, "x")) ??
    numberFrom(attrValue(style, "left")) ??
    0;
  const y =
    numberFrom(attrValue(props, "y")) ??
    numberFrom(attrValue(style, "top")) ??
    0;
  const width =
    numberFrom(attrValue(props, "width")) ??
    numberFrom(attrValue(style, "width")) ??
    0;
  const height =
    numberFrom(attrValue(props, "height")) ??
    numberFrom(attrValue(style, "height")) ??
    0;
  return { x, y, width, height };
}

export class DocumentTools {
  readonly handles: HandleRegistry;
  private readonly client: AgentSocketClient;
  private generation = -1;

  constructor(client: AgentSocketClient, options: DocumentToolsOptions = {}) {
    this.client = client;
    this.handles = new HandleRegistry(options.maxHandles);
    client.onState(() => {
      if (client.generation !== this.generation) {
        this.handles.invalidateAll();
        this.generation = client.generation;
      }
    });
  }

  async readState(): Promise<ReadStateResult> {
    await this.prepare();
    const versions = await this.readVersions();
    const pages = Object.keys(versions)
      .filter((file) => file.startsWith("pages/") && file.endsWith(".tsx"))
      .map((file) => ({ file, name: basename(file, ".tsx") }));
    return {
      projectRoot: this.client.projectRoot,
      pages,
      versions,
      selection: null,
      selectionAvailable: false,
      handleCount: this.handles.size,
    };
  }

  async readTree(input: { page: string }): Promise<ReadTreeResult> {
    await this.prepare();
    const payload = await this.client.query({
      type: "tree",
      file: input.page,
    });
    const layers = Array.isArray(payload.layers) ? payload.layers : [];
    const required = countLayerNodes(layers);
    if (required > this.handles.limit)
      throw new HandleLimitError(this.handles.limit, required);
    const nextHandles = this.handles.fork(required);
    const nodes: TreeNode[] = [];
    for (const layer of layers)
      nodes.push(await this.nodeFromLayer(layer, nextHandles));
    this.handles.adopt(nextHandles);
    return {
      page: input.page,
      nodes,
      handleCount: this.handles.size,
    };
  }

  async readNode(input: { handle: string }): Promise<ReadNodeResult> {
    await this.prepare();
    const record = this.requireHandle(input.handle);
    const element = await this.resolveHandle(record, input.handle);
    return {
      handle: input.handle,
      file: record.file,
      path: record.path,
      tag: String(element.tag ?? record.tag),
      name: String(element.name ?? record.dataName ?? ""),
      rect: rectFromElement(element),
      style: arrayOfRecords(element.style),
      props: arrayOfRecords(element.props),
      attrs: arrayOfRecords(element.attrs),
      text: String(element.text ?? ""),
    };
  }

  async applyEdits(input: {
    commands: HandleEditCommand[];
  }): Promise<AppliedTransaction> {
    await this.prepare();
    const actor = this.client.actor;
    if (!actor)
      throw new ToolError(
        "session_uninitialized",
        "agent session is not ready",
      );
    const resolved: EditCommand[] = [];
    const refCache = new Map<string, Promise<NodeRef>>();
    for (let index = 0; index < input.commands.length; index += 1) {
      const command = input.commands[index];
      if (!command) continue;
      resolved.push(await this.resolveCommand(command, index, refCache));
    }
    const activity = collectActivityTargets(resolved);
    if (activity.length > 0) this.client.sendActivity(activity);
    const doc = this.client.nextDoc(
      (message) =>
        (message.kind === "transactionApplied" &&
          message.transaction.actor === actor) ||
        message.kind === "commandFailed",
    );
    this.client.sendShell({
      kind: "applyCommands",
      commands: resolved,
      baseVersions: [],
    });
    const message = await doc;
    if (message.kind === "commandFailed") {
      let versions: Record<string, string> | undefined;
      try {
        versions = await this.readVersions();
      } catch {
        versions = undefined;
      }
      throw new ToolError("command_failed", message.message, {
        failedCommandIndex: null,
        versions,
      });
    }
    if (message.kind !== "transactionApplied")
      throw new ToolError("unexpected_doc", "unexpected document event");
    if (input.commands.some((command) => PAGE_COMMANDS[command.kind] === true))
      this.handles.invalidateAll();
    else if (
      input.commands.some(
        (command) => STRUCTURAL_COMMANDS[command.kind] === true,
      )
    )
      for (const file of message.transaction.changedFiles)
        this.handles.invalidateFile(file);
    return message.transaction;
  }

  async select(input: { handles: string[] }): Promise<SelectResult> {
    await this.prepare();
    const targets: AgentPresenceTarget[] = [];
    const seen = new Set<string>();
    for (const handle of input.handles) {
      const record = this.requireHandle(handle);
      await this.resolveHandle(record, handle);
      const key = `${record.file}:${record.path.join("/")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ file: record.file, path: [...record.path] });
    }
    const payload = await this.client.query({ type: "select", targets });
    return {
      ok: payload.ok === true,
      actor: String(payload.actor ?? ""),
      color: String(payload.color ?? ""),
      targets,
    };
  }

  async screenshot(input: { page?: string }): Promise<ScreenshotResult> {
    await this.prepare();
    const payload = await this.client.query({
      type: "screenshot",
      page: input.page,
    });
    const image = payload.image;
    if (!isRecord(image)) throw new ToolError("invalid_response", "no image");
    const { data, mimeType, width, height } = image;
    if (
      typeof data !== "string" ||
      (mimeType !== "image/png" && mimeType !== "image/jpeg") ||
      typeof width !== "number" ||
      typeof height !== "number"
    )
      throw new ToolError("invalid_response", "invalid image payload");
    return { mimeType, data, width, height };
  }

  async exportFile(input: ExportFileInput): Promise<ExportResult> {
    await this.prepare();
    const target = input.handle
      ? await this.resolveHandleRef({ handle: input.handle }, 0)
      : {
          file: input.file ?? "",
          path: input.path,
          start: 0,
          end: 0,
        };
    if (!target.file)
      throw new ToolError("invalid_input", "export needs a handle or file");
    const format = input.format ?? "png";
    const request: ExportNodeRequest = {
      file: target.file,
      path: target.path,
      name: input.name ?? target.file.replace(/\.[^.]+$/, ""),
      settings: [
        {
          id: "agent",
          format,
          scale: {
            type: "scale",
            value: input.scale ?? (format === "svg" ? 1 : 2),
          },
          suffix: "",
        },
      ],
    };
    const payload = await this.client.query({ type: "export", request });
    return {
      ok: payload.ok === true,
      written: Array.isArray(payload.written)
        ? payload.written.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : undefined,
    };
  }

  readSkill(): string {
    return DIALECT_DOC;
  }

  private async prepare(): Promise<void> {
    await this.client.waitForReady();
    if (this.client.generation !== this.generation) {
      this.handles.invalidateAll();
      this.generation = this.client.generation;
    }
  }

  private async readVersions(): Promise<Record<string, string>> {
    const payload = await this.client.query({ type: "versions" });
    const versions = payload.versions;
    return isRecord(versions)
      ? Object.fromEntries(
          Object.entries(versions).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  }

  private requireHandle(handle: string): HandleRecord {
    const record = this.handles.get(handle);
    if (!record)
      throw new ToolError("handle_not_found", "unknown or invalidated handle", {
        handle,
      });
    return record;
  }

  private async resolveHandle(
    record: HandleRecord,
    handle: string,
    failedCommandIndex?: number,
  ): Promise<Record<string, unknown>> {
    const payload = await this.client.query({
      type: "resolve",
      file: record.file,
      path: record.path,
    });
    if (!isRecord(payload.element))
      throw new ToolError(
        "stale_handle",
        "handle no longer resolves to a node; call read_tree again",
        {
          handle,
          failedCommandIndex,
        },
      );
    if (fragmentHashOfElement(payload.element) !== record.fragmentHash)
      throw new ToolError(
        "stale_handle",
        "node fingerprint changed; call read_tree again",
        {
          handle,
          failedCommandIndex,
        },
      );
    return payload.element;
  }

  private async nodeFromLayer(
    layer: unknown,
    handles: HandleRegistry,
  ): Promise<TreeNode> {
    if (!isRecord(layer))
      throw new ToolError("invalid_tree", "invalid tree node");
    const ref = layer.ref;
    if (
      !isRecord(ref) ||
      typeof ref.file !== "string" ||
      !Array.isArray(ref.path)
    )
      throw new ToolError("invalid_tree", "tree node has no ref");
    const path = ref.path.filter(
      (part): part is number => typeof part === "number",
    );
    const payload = await this.client.query({
      type: "resolve",
      file: ref.file,
      path,
    });
    if (!isRecord(payload.element))
      throw new ToolError("invalid_tree", "tree node no longer resolves");
    const element = payload.element;
    const handle = handles.issue({
      file: ref.file,
      path,
      tag: String(layer.tag ?? element.tag ?? ""),
      dataName:
        typeof attrValue(arrayOfRecords(element.attrs), "data-name") ===
        "string"
          ? String(attrValue(arrayOfRecords(element.attrs), "data-name"))
          : null,
      fragmentHash: fragmentHashOfElement(element),
    });
    const children: TreeNode[] = [];
    if (Array.isArray(layer.children))
      for (const child of layer.children)
        children.push(await this.nodeFromLayer(child, handles));
    return {
      handle,
      tag: String(layer.tag ?? ""),
      name: String(layer.name ?? ""),
      path,
      rect: rectFromElement(element),
      children,
    };
  }

  private async resolveCommand(
    command: HandleEditCommand,
    index: number,
    cache: Map<string, Promise<NodeRef>>,
  ): Promise<EditCommand> {
    const resolveRef = async (ref: HandleRef): Promise<NodeRef> => {
      const cached = cache.get(ref.handle);
      if (cached) return cached;
      const pending = this.resolveHandleRef(ref, index);
      cache.set(ref.handle, pending);
      return pending;
    };
    if (command.kind === "setStyle")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "setText")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "setAttrs")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "createNodes")
      return {
        ...command,
        parent: command.parent ? await resolveRef(command.parent) : null,
      };
    if (command.kind === "deleteNodes")
      return {
        ...command,
        targets: await Promise.all(command.targets.map(resolveRef)),
      };
    if (command.kind === "duplicateNode")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "reparent")
      return {
        ...command,
        target: await resolveRef(command.target),
        parent: command.parent ? await resolveRef(command.parent) : null,
      };
    if (command.kind === "groupNodes")
      return {
        ...command,
        targets: await Promise.all(command.targets.map(resolveRef)),
        parent: command.parent ? await resolveRef(command.parent) : null,
      };
    if (command.kind === "ungroupNode")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "createComponent")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "detachInstance")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "flattenBoolean")
      return { ...command, target: await resolveRef(command.target) };
    if (command.kind === "createVariantSet")
      return {
        ...command,
        targets: await Promise.all(command.targets.map(resolveRef)),
      };
    return command;
  }

  private async resolveHandleRef(
    ref: HandleRef,
    index: number,
  ): Promise<NodeRef> {
    const record = this.requireHandle(ref.handle);
    const element = await this.resolveHandle(record, ref.handle, index);
    const parsed = nodeRefSchema.safeParse(element.ref);
    if (!parsed.success)
      throw new ToolError("stale_handle", "handle has no current node ref", {
        handle: ref.handle,
        failedCommandIndex: index,
      });
    return {
      ...parsed.data,
      path: record.path.length > 0 ? [...record.path] : parsed.data.path,
    };
  }
}
