import { DocumentService } from "@ombrique/doc-service";
import { locateByPath, type DesignElement } from "@ombrique/source";
import { toLayer } from "./layer-tree.js";
import { createDesignCompiler, type DesignCompiler } from "@ombrique/compiler";
import type { DocToShell, EditCommand, ShellToDoc } from "@ombrique/protocol";
import { shellToDocSchema } from "@ombrique/protocol";

type Port = Electron.ParentPort;

const parentPort: Port | undefined = process.parentPort;

if (!parentPort) {
  throw new Error("doc-host must run inside an Electron utility process");
}

const port: Port = parentPort;

let service: DocumentService | null = null;
let compiler: DesignCompiler | null = null;
let compileRoot: string | null = null;

function send(message: unknown) {
  port.postMessage(message);
}

function emit(message: DocToShell) {
  send({ type: "doc", message });
}

async function ensureCompiler(root: string) {
  if (compiler && compileRoot === root) return compiler;
  await compiler?.close();
  compiler = await createDesignCompiler(root);
  compileRoot = root;
  compiler.setWire((payload) => send({ type: "hmr", payload }));
  return compiler;
}

async function handle(message: ShellToDoc) {
  if (message.kind === "openProject") {
    service?.close();
    service = new DocumentService({ emit });
    const manifest = service.open(message.path);
    await ensureCompiler(message.path);
    const files: Record<string, string> = {};
    for (const [file, state] of service.project.files) files[file] = state.text;
    send({ type: "project", root: message.path, manifest, files });
    return;
  }

  if (!service) throw new Error("no project open");

  if (message.kind === "applyCommands") {
    const commands: EditCommand[] = message.commands;
    const transaction = service.apply(commands, message.baseVersions);
    send({
      type: "files",
      files: snapshotFiles(service),
      manifest: service.project.manifest,
    });
    return transaction;
  }
  if (message.kind === "undo") {
    service.undo();
    send({
      type: "files",
      files: snapshotFiles(service),
      manifest: service.project.manifest,
    });
    return;
  }
  if (message.kind === "redo") {
    service.redo();
    send({
      type: "files",
      files: snapshotFiles(service),
      manifest: service.project.manifest,
    });
    return;
  }
}

function snapshotFiles(current: DocumentService): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [file, state] of current.project.files) files[file] = state.text;
  return files;
}

function sharedStylesFor(
  current: DocumentService,
  element: DesignElement,
): Array<{
  file: string;
  selector: string;
  fullSelector: string;
  prop: string;
  value: string;
  propSpan: { start: number; end: number };
  valueSpan: { start: number; end: number };
}> {
  const out: Array<{
    file: string;
    selector: string;
    fullSelector: string;
    prop: string;
    value: string;
    propSpan: { start: number; end: number };
    valueSpan: { start: number; end: number };
  }> = [];
  const className = element.className?.staticValue;
  if (!className) return out;
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    const rules = current.project.index.styles.byClass.get(cls) ?? [];
    for (const rule of rules) {
      for (const decl of rule.decls) {
        out.push({
          file: rule.file,
          selector: rule.selector,
          fullSelector: rule.fullSelector,
          prop: decl.prop,
          value: decl.value,
          propSpan: decl.propSpan,
          valueSpan: decl.valueSpan,
        });
      }
    }
  }
  return out;
}

port.on("message", async (event) => {
  const data = event.data as Record<string, unknown>;
  if (data.type === "compile") {
    try {
      const root = String(data.root);
      const active = await ensureCompiler(root);
      const code = await active.transform(String(data.url));
      send({ type: "compileResult", id: data.id, code });
    } catch (error) {
      send({ type: "compileResult", id: data.id, error: String(error) });
    }
    return;
  }
  if (data.type === "html") {
    try {
      const active = compiler;
      const html = active
        ? await active.transformHtml(String(data.html))
        : String(data.html);
      send({ type: "htmlResult", id: data.id, html });
    } catch (error) {
      send({ type: "htmlResult", id: data.id, error: String(error) });
    }
    return;
  }
  if (data.type === "resolve") {
    try {
      if (!service) throw new Error("no project open");
      const file = String(data.file);
      const path = data.path as number[];
      const element = locateByPath(service.project.index, file, path);
      send({
        type: "resolveResult",
        id: data.id,
        element: element
          ? {
              ref: element.ref,
              path: element.path,
              tag: element.tag,
              kind: element.kind,
              generated: element.generated,
              name:
                element.dataAttrs["data-name"] ??
                (typeof element.attrs.name?.value === "string"
                  ? element.attrs.name.value
                  : null) ??
                (element.texts
                  .map((t) => t.value)
                  .join("")
                  .trim().length > 0
                  ? element.texts
                      .map((t) => t.value)
                      .join("")
                      .trim().length > 24
                    ? `${element.texts
                        .map((t) => t.value)
                        .join("")
                        .trim()
                        .slice(0, 24)}…`
                    : element.texts
                        .map((t) => t.value)
                        .join("")
                        .trim()
                  : null),
              hidden: element.attrs.hidden?.value === true,
              locked: element.dataAttrs["data-locked"] !== undefined,
              text: element.texts.map((t) => t.value).join(""),
              style: element.style.map((prop) => ({
                key: prop.key,
                value: prop.value,
                dynamic: prop.dynamic,
              })),
              props: Object.entries(element.attrs)
                .filter(
                  ([key]) =>
                    !key.startsWith("data-") &&
                    key !== "className" &&
                    key !== "style",
                )
                .map(([key, attr]) => ({
                  key,
                  value: attr.value,
                  dynamic: attr.kind === "expression",
                })),
              attrs: Object.entries(element.dataAttrs).map(([key, value]) => ({
                key,
                value,
              })),
              sharedStyles: sharedStylesFor(service, element),
              componentName:
                element.kind === "component" ? element.tag : undefined,
            }
          : null,
      });
    } catch (error) {
      send({ type: "resolveResult", id: data.id, error: String(error) });
    }
    return;
  }
  if (data.type === "versions") {
    const versions: Record<string, string> = {};
    if (service) {
      for (const [file, state] of service.project.files)
        versions[file] = state.version;
    }
    send({ type: "versionsResult", id: data.id, versions });
    return;
  }
  if (data.type === "tree") {
    try {
      if (!service) throw new Error("no project open");
      const file = String(data.file);
      const page = service.project.index.pages.find(
        (entry) => entry.file === file,
      );
      const layers = page?.root ? [toLayer(page.root)] : [];
      send({ type: "treeResult", id: data.id, layers });
    } catch (error) {
      send({ type: "treeResult", id: data.id, error: String(error) });
    }
    return;
  }
  if (data.type === "tokens") {
    try {
      if (!service) throw new Error("no project open");
      const sheet = service.project.index.styles.files.get("tokens.css");
      const tokens: Array<{
        name: string;
        value: string;
        file: string;
        span: { start: number; end: number };
      }> = [];
      if (sheet) {
        for (const rule of sheet.rules) {
          for (const decl of rule.decls) {
            tokens.push({
              name: decl.prop,
              value: decl.value,
              file: "tokens.css",
              span: decl.propSpan,
            });
          }
        }
      }
      send({ type: "tokensResult", id: data.id, tokens });
    } catch (error) {
      send({ type: "tokensResult", id: data.id, error: String(error) });
    }
    return;
  }
  if (data.type === "styles") {
    try {
      if (!service) throw new Error("no project open");
      const styles: Array<{
        file: string;
        selector: string;
        fullSelector: string;
        decls: Array<{
          prop: string;
          value: string;
          propSpan: { start: number; end: number };
          valueSpan: { start: number; end: number };
        }>;
      }> = [];
      for (const sheet of service.project.index.styles.files.values()) {
        for (const rule of sheet.rules) {
          styles.push({
            file: rule.file,
            selector: rule.selector,
            fullSelector: rule.fullSelector,
            decls: rule.decls.map((d) => ({
              prop: d.prop,
              value: d.value,
              propSpan: d.propSpan,
              valueSpan: d.valueSpan,
            })),
          });
        }
      }
      send({ type: "stylesResult", id: data.id, styles });
    } catch (error) {
      send({ type: "stylesResult", id: data.id, error: String(error) });
    }
    return;
  }
  if (data.type === "shell") {
    const parsed = shellToDocSchema.safeParse(data.message);
    if (!parsed.success) {
      emit({ kind: "commandFailed", message: "无效的编辑指令" });
      return;
    }
    try {
      await handle(parsed.data);
    } catch (error) {
      emit({
        kind: "commandFailed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

process.on("uncaughtException", (error) => {
  send({ type: "fatal", message: String(error) });
});

send({ type: "ready" });
