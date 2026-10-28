import type {
  Declaration,
  EditCommand,
  NodeRef,
  NodeSpec,
} from "../../protocol/src/index.js";
import { applyEdits } from "./apply-edits.js";
import type { DesignIndex } from "./build-index.js";
import { parseDesignFile } from "./parse-design-file.js";
import type {
  DesignElement,
  ParsedDesignFile,
  PlanResult,
  Span,
  TextEdit,
} from "./types.js";

const PX_PROPS: Record<string, true> = {
  left: true,
  top: true,
  right: true,
  bottom: true,
  width: true,
  height: true,
  minWidth: true,
  maxWidth: true,
  minHeight: true,
  maxHeight: true,
  gap: true,
  rowGap: true,
  columnGap: true,
  padding: true,
  margin: true,
  paddingTop: true,
  paddingRight: true,
  paddingBottom: true,
  paddingLeft: true,
  marginTop: true,
  marginRight: true,
  marginBottom: true,
  marginLeft: true,
  borderRadius: true,
  borderWidth: true,
  fontSize: true,
};

function lineStart(code: string, pos: number): number {
  return code.lastIndexOf("\n", pos - 1) + 1;
}

function lineIndentAt(code: string, pos: number): string {
  const start = lineStart(code, pos);
  let end = start;
  while (end < code.length && (code[end] === " " || code[end] === "\t")) end++;
  return code.slice(start, end);
}

function escapeJsxText(text: string): string {
  return text
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("{", "&#123;")
    .replaceAll("}", "&#125;");
}

function formatDeclaration(prop: string, value: string | number): string {
  if (typeof value === "number") {
    return prop in PX_PROPS ? String(value) : JSON.stringify(String(value));
  }
  if (prop in PX_PROPS && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return String(Number(value));
  }
  return JSON.stringify(value);
}

function genSpec(spec: NodeSpec): string {
  const style = [
    `position: "absolute"`,
    `left: ${spec.x}`,
    `top: ${spec.y}`,
    `width: ${spec.width}`,
  ];
  if (spec.kind !== "text") style.push(`height: ${spec.height}`);
  if (spec.kind === "text" && spec.fontSize !== undefined)
    style.push(`fontSize: ${spec.fontSize}`);
  if (spec.fill !== undefined)
    style.push(`background: ${JSON.stringify(spec.fill)}`);
  const styleAttr = `style={{ ${style.join(", ")} }}`;
  if (spec.kind === "text")
    return `<Text ${styleAttr}>${escapeJsxText(spec.text)}</Text>`;
  const nameAttr = `data-name=${JSON.stringify(spec.name)}`;
  if (spec.kind === "frame") return `<Frame ${nameAttr} ${styleAttr} />`;
  if (spec.kind === "rect") return `<Rect ${nameAttr} ${styleAttr} />`;
  if (spec.kind === "ellipse") return `<Ellipse ${nameAttr} ${styleAttr} />`;
  return `<Star ${nameAttr} ${styleAttr} />`;
}

function deletionSpan(code: string, el: DesignElement): Span {
  let start = el.ref.start;
  let end = el.ref.end;
  let i = start;
  while (i > 0 && (code[i - 1] === " " || code[i - 1] === "\t")) i--;
  if (i > 0 && code[i - 1] === "\n") {
    start = i;
    if (code[end] === "\r" && code[end + 1] === "\n") end += 2;
    else if (code[end] === "\n") end += 1;
  }
  return { start, end };
}

function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Span[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      out.push({ start: span.start, end: span.end });
    }
  }
  return out;
}

interface JsonValue {
  kind: "object" | "array" | "string" | "scalar";
  start: number;
  end: number;
  value: string;
  props: { key: string; keySpan: Span; value: JsonValue }[];
  items: JsonValue[];
}

class JsonScanner {
  private pos = 0;
  constructor(private code: string) {}

  private skipWs(): void {
    while (this.pos < this.code.length) {
      const ch = this.code[this.pos];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") this.pos++;
      else break;
    }
  }

  private error(message: string): never {
    throw new Error(`ombrique.json: ${message} at offset ${this.pos}`);
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.code[this.pos] !== ch) this.error(`expected '${ch}'`);
    this.pos++;
  }

  parseValue(): JsonValue {
    this.skipWs();
    const ch = this.code[this.pos];
    if (ch === "{") return this.parseObject();
    if (ch === "[") return this.parseArray();
    if (ch === '"') return this.parseString();
    const start = this.pos;
    while (
      this.pos < this.code.length &&
      !",]} \t\n\r".includes(this.code.charAt(this.pos))
    )
      this.pos++;
    if (this.pos === start) this.error("expected a value");
    return {
      kind: "scalar",
      start,
      end: this.pos,
      value: this.code.slice(start, this.pos),
      props: [],
      items: [],
    };
  }

  private parseString(): JsonValue {
    const start = this.pos;
    this.pos++;
    let decoded = "";
    while (this.pos < this.code.length) {
      const ch = this.code[this.pos];
      if (ch === '"') {
        this.pos++;
        return {
          kind: "string",
          start,
          end: this.pos,
          value: decoded,
          props: [],
          items: [],
        };
      }
      if (ch === "\\") {
        const next = this.code[this.pos + 1];
        const simple: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (next === "u") {
          decoded += String.fromCharCode(
            Number.parseInt(this.code.slice(this.pos + 2, this.pos + 6), 16),
          );
          this.pos += 6;
          continue;
        }
        if (next !== undefined && next in simple) {
          decoded += simple[next];
          this.pos += 2;
          continue;
        }
        this.error("invalid escape");
      }
      decoded += ch;
      this.pos++;
    }
    this.error("unterminated string");
  }

  private parseObject(): JsonValue {
    const start = this.pos;
    this.expect("{");
    const props: JsonValue["props"] = [];
    this.skipWs();
    if (this.code[this.pos] === "}") {
      this.pos++;
      return {
        kind: "object",
        start,
        end: this.pos,
        value: "",
        props,
        items: [],
      };
    }
    for (;;) {
      this.skipWs();
      if (this.code[this.pos] !== '"') this.error("expected object key");
      const key = this.parseString();
      this.expect(":");
      const value = this.parseValue();
      props.push({
        key: key.value,
        keySpan: { start: key.start, end: key.end },
        value,
      });
      this.skipWs();
      const ch = this.code[this.pos];
      if (ch === ",") {
        this.pos++;
        continue;
      }
      if (ch === "}") {
        this.pos++;
        return {
          kind: "object",
          start,
          end: this.pos,
          value: "",
          props,
          items: [],
        };
      }
      this.error("expected ',' or '}'");
    }
  }

  private parseArray(): JsonValue {
    const start = this.pos;
    this.expect("[");
    const items: JsonValue[] = [];
    this.skipWs();
    if (this.code[this.pos] === "]") {
      this.pos++;
      return {
        kind: "array",
        start,
        end: this.pos,
        value: "",
        props: [],
        items,
      };
    }
    for (;;) {
      items.push(this.parseValue());
      this.skipWs();
      const ch = this.code[this.pos];
      if (ch === ",") {
        this.pos++;
        continue;
      }
      if (ch === "]") {
        this.pos++;
        return {
          kind: "array",
          start,
          end: this.pos,
          value: "",
          props: [],
          items,
        };
      }
      this.error("expected ',' or ']'");
    }
  }
}

interface ManifestEntryModel {
  id: string;
  file: string;
  name: string | null;
  nameValue: JsonValue | null;
  node: JsonValue;
}

interface ManifestModel {
  pages: JsonValue;
  entries: ManifestEntryModel[];
}

function manifestModel(text: string): ManifestModel {
  const root = new JsonScanner(text).parseValue();
  if (root.kind !== "object")
    throw new Error("ombrique.json: root must be an object");
  const pagesProp = root.props.find((p) => p.key === "pages");
  if (!pagesProp || pagesProp.value.kind !== "array")
    throw new Error("ombrique.json: missing pages array");
  const entries: ManifestEntryModel[] = [];
  for (const item of pagesProp.value.items) {
    if (item.kind !== "object") continue;
    const idProp = item.props.find((p) => p.key === "id");
    const fileProp = item.props.find((p) => p.key === "file");
    const nameProp = item.props.find((p) => p.key === "name");
    entries.push({
      id: idProp?.value.kind === "string" ? idProp.value.value : "",
      file: fileProp?.value.kind === "string" ? fileProp.value.value : "",
      name: nameProp?.value.kind === "string" ? nameProp.value.value : null,
      nameValue:
        nameProp && nameProp.value.kind === "string" ? nameProp.value : null,
      node: item,
    });
  }
  return { pages: pagesProp.value, entries };
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "page";
}

function pascalCase(slug: string): string {
  const pascal = slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[0-9]/.test(pascal) ? `Page${pascal}` : pascal;
}

function insertAttrPos(code: string, el: DesignElement): number {
  const open = el.openingSpan;
  if (el.selfClosing) {
    const slash = code.lastIndexOf("/", open.end);
    if (slash >= open.start) return slash;
  }
  return open.end - 1;
}

function planChildInsert(
  code: string,
  parent: DesignElement,
  index: number,
  elemBlock: string,
): TextEdit {
  const kids = parent.children;
  const clamped = Math.max(0, Math.min(index, kids.length));
  if (clamped < kids.length) {
    const target = kids[clamped];
    if (!target) throw new Error("unreachable");
    const targetLine = lineStart(code, target.ref.start);
    const between = code.slice(targetLine, target.ref.start);
    if (
      targetLine > 0 &&
      code[targetLine - 1] === "\n" &&
      /^\s*$/.test(between)
    ) {
      return {
        file: parent.ref.file,
        start: targetLine,
        end: targetLine,
        text: `${between}${elemBlock}\n`,
      };
    }
    return {
      file: parent.ref.file,
      start: target.ref.start,
      end: target.ref.start,
      text: elemBlock,
    };
  }
  if (parent.closingSpan) {
    const closing = parent.closingSpan;
    const closingLine = lineStart(code, closing.start);
    const between = code.slice(closingLine, closing.start);
    if (
      closingLine > 0 &&
      code[closingLine - 1] === "\n" &&
      /^\s*$/.test(between)
    ) {
      return {
        file: parent.ref.file,
        start: closingLine,
        end: closingLine,
        text: `${between}${elemBlock}\n`,
      };
    }
    return {
      file: parent.ref.file,
      start: closing.start,
      end: closing.start,
      text: elemBlock,
    };
  }
  const open = parent.openingSpan;
  let cut = open.end - 2;
  if (code[cut - 1] === " " || code[cut - 1] === "\t") cut--;
  const parentIndent = lineIndentAt(code, parent.ref.start);
  const childIndent = `${parentIndent}  `;
  const indented = elemBlock
    .split("\n")
    .map((line) => `${childIndent}${line}`)
    .join("\n");
  return {
    file: parent.ref.file,
    start: cut,
    end: open.end,
    text: `>\n${indented}\n${parentIndent}</${parent.tag}>`,
  };
}

function selfClosingExpansionCut(code: string, el: DesignElement): number {
  const open = el.openingSpan;
  let cut = open.end - 2;
  if (code[cut - 1] === " " || code[cut - 1] === "\t") cut--;
  return cut;
}

function reindentBlock(
  raw: string,
  oldIndent: string,
  newIndent: string,
): string {
  const lines = raw.split("\n");
  lines[0] = `${newIndent}${lines[0] ?? ""}`;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith(oldIndent)) {
      lines[i] = `${newIndent}${line.slice(oldIndent.length)}`;
    }
  }
  return lines.join("\n");
}

class Planner {
  private texts = new Map<string, string>();
  private parsedCache = new Map<string, ParsedDesignFile>();
  private manifestCache: { text: string; model: ManifestModel } | null = null;
  private plannedFiles = new Set<string>();
  readonly edits: TextEdit[] = [];
  readonly changedFiles = new Set<string>();
  deletedPageFile: string | undefined;

  constructor(private index: DesignIndex) {
    for (const [file, text] of index.sources) this.texts.set(file, text);
    for (const page of index.pages) this.plannedFiles.add(page.file);
  }

  private textOf(file: string): string {
    const text = this.texts.get(file);
    if (text === undefined) throw new Error(`unknown file: ${file}`);
    return text;
  }

  private parsedOf(file: string): ParsedDesignFile {
    let parsed = this.parsedCache.get(file);
    if (!parsed) {
      parsed = parseDesignFile(file, this.textOf(file));
      this.parsedCache.set(file, parsed);
    }
    return parsed;
  }

  private manifest(): { file: string; text: string; model: ManifestModel } {
    const file = this.index.manifestFile;
    if (!file) throw new Error("project has no ombrique.json manifest");
    const text = this.textOf(file);
    if (!this.manifestCache || this.manifestCache.text !== text) {
      this.manifestCache = { text, model: manifestModel(text) };
    }
    return { file, text, model: this.manifestCache.model };
  }

  private anchor(ref: NodeRef): DesignElement {
    const original = this.index.byRef(ref);
    if (!original)
      throw new Error(`target not found: ${ref.file}#${ref.start}`);
    if (this.textOf(ref.file) === (this.index.sources.get(ref.file) ?? ""))
      return original;
    const reparsed = this.parsedOf(ref.file);
    const relocated = locateInParsed(reparsed, original.path);
    if (!relocated) {
      throw new Error(
        `element at path /${original.path.join("/")} no longer exists in ${ref.file}`,
      );
    }
    return relocated;
  }

  private pageRoot(pageFile: string): DesignElement {
    const parsed = this.parsedOf(pageFile);
    if (!parsed.root) throw new Error(`page ${pageFile} has no root element`);
    return parsed.root;
  }

  apply(commandEdits: TextEdit[]): void {
    const byFile = new Map<string, TextEdit[]>();
    for (const edit of commandEdits) {
      const list = byFile.get(edit.file);
      if (list) list.push(edit);
      else byFile.set(edit.file, [edit]);
    }
    for (const [file, fileEdits] of byFile) {
      this.texts.set(file, applyEdits(this.textOf(file), fileEdits));
      this.parsedCache.delete(file);
      if (file === this.index.manifestFile) this.manifestCache = null;
      this.changedFiles.add(file);
    }
    this.edits.push(...commandEdits);
  }

  setStyle(target: NodeRef, declarations: Declaration[]): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    const existing = new Map(el.style.map((s) => [s.key, s]));
    const removed = new Set<string>();
    const updates = new Map<string, string | number>();
    for (const [prop, value] of declarations) {
      if (value === null) {
        if (existing.has(prop)) removed.add(prop);
        continue;
      }
      if (!updates.has(prop)) updates.set(prop, value);
    }
    if (el.styleObjectSpan) {
      const parts: string[] = [];
      for (const prop of el.style) {
        if (removed.has(prop.key)) continue;
        const update = updates.get(prop.key);
        if (update !== undefined) {
          const keyText = code.slice(prop.keySpan.start, prop.keySpan.end);
          parts.push(`${keyText}: ${formatDeclaration(prop.key, update)}`);
        } else {
          parts.push(code.slice(prop.propSpan.start, prop.propSpan.end));
        }
      }
      for (const [prop, value] of updates) {
        if (!existing.has(prop))
          parts.push(`${prop}: ${formatDeclaration(prop, value)}`);
      }
      const objText = parts.length > 0 ? `{ ${parts.join(", ")} }` : `{}`;
      return [
        {
          file: el.ref.file,
          start: el.styleObjectSpan.start,
          end: el.styleObjectSpan.end,
          text: objText,
        },
      ];
    }
    if (el.styleAttrSpan) {
      throw new Error(
        `style attribute of ${el.ref.file}#${el.ref.start} is not a static object`,
      );
    }
    const parts: string[] = [];
    for (const [prop, value] of updates) {
      if (!removed.has(prop))
        parts.push(`${prop}: ${formatDeclaration(prop, value)}`);
    }
    if (parts.length === 0) return [];
    let text = ` style={{ ${parts.join(", ")} }}`;
    const pos = insertAttrPos(code, el);
    if (code[pos - 1] === " " || code[pos - 1] === "\t") text = text.slice(1);
    return [{ file: el.ref.file, start: pos, end: pos, text }];
  }

  setText(target: NodeRef, text: string): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    const escaped = escapeJsxText(text);
    if (el.textSpan) {
      return [
        {
          file: el.ref.file,
          start: el.textSpan.start,
          end: el.textSpan.end,
          text: escaped,
        },
      ];
    }
    if (el.selfClosing) {
      const cut = selfClosingExpansionCut(code, el);
      return [
        {
          file: el.ref.file,
          start: cut,
          end: el.openingSpan.end,
          text: `>${escaped}</${el.tag}>`,
        },
      ];
    }
    return [
      {
        file: el.ref.file,
        start: el.openingSpan.end,
        end: el.openingSpan.end,
        text: escaped,
      },
    ];
  }

  setAttrs(
    target: NodeRef,
    attrs: Record<string, string | number | boolean | null>,
  ): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    const edits: TextEdit[] = [];
    for (const [name, value] of Object.entries(attrs)) {
      const existing = el.attrs[name];
      if (value === null || value === false) {
        if (!existing) continue;
        let start = existing.attrSpan.start;
        if (start > 0 && (code[start - 1] === " " || code[start - 1] === "\t"))
          start--;
        edits.push({
          file: el.ref.file,
          start,
          end: existing.attrSpan.end,
          text: "",
        });
        continue;
      }
      let text: string;
      if (value === true) {
        if (existing?.kind === "boolean" && existing.value === true) continue;
        text = name;
      } else if (typeof value === "string") {
        text = `${name}=${JSON.stringify(value)}`;
      } else {
        text = `${name}={${value}}`;
      }
      if (existing) {
        edits.push({
          file: el.ref.file,
          start: existing.attrSpan.start,
          end: existing.attrSpan.end,
          text,
        });
        continue;
      }
      let insertText = ` ${text}`;
      const pos = insertAttrPos(code, el);
      if (code[pos - 1] === " " || code[pos - 1] === "\t")
        insertText = insertText.slice(1);
      edits.push({ file: el.ref.file, start: pos, end: pos, text: insertText });
    }
    return edits;
  }

  createNodes(
    parent: NodeRef | null,
    pageFile: string,
    index: number,
    specs: NodeSpec[],
  ): TextEdit[] {
    const parentEl = parent ? this.anchor(parent) : this.pageRoot(pageFile);
    const code = this.textOf(parentEl.ref.file);
    const elemBlock = specs.map(genSpec).join("\n");
    return [planChildInsert(code, parentEl, index, elemBlock)];
  }

  deleteNodes(targets: NodeRef[]): TextEdit[] {
    const byFile = new Map<string, Span[]>();
    for (const target of targets) {
      const el = this.anchor(target);
      const code = this.textOf(el.ref.file);
      const span = deletionSpan(code, el);
      const list = byFile.get(el.ref.file);
      if (list) list.push(span);
      else byFile.set(el.ref.file, [span]);
    }
    const edits: TextEdit[] = [];
    for (const [file, spans] of byFile) {
      for (const span of mergeSpans(spans)) {
        edits.push({ file, start: span.start, end: span.end, text: "" });
      }
    }
    return edits;
  }

  reparent(
    target: NodeRef,
    parent: NodeRef | null,
    pageFile: string,
    index: number,
  ): TextEdit[] {
    const el = this.anchor(target);
    const parentEl = parent ? this.anchor(parent) : this.pageRoot(pageFile);
    if (
      el.ref.file === parentEl.ref.file &&
      parentEl.ref.start >= el.ref.start &&
      parentEl.ref.end <= el.ref.end
    ) {
      throw new Error("cannot reparent an element into its own subtree");
    }
    const code = this.textOf(el.ref.file);
    const destCode = this.textOf(parentEl.ref.file);
    const kids = parentEl.children.filter(
      (k) => !(k.ref.start === el.ref.start && k.ref.end === el.ref.end),
    );
    const del = deletionSpan(code, el);
    const raw = code.slice(el.ref.start, el.ref.end);
    const oldIndent = lineIndentAt(code, el.ref.start);
    const firstKid = kids[0];
    const destChildIndent = firstKid
      ? lineIndentAt(destCode, firstKid.ref.start)
      : `${lineIndentAt(destCode, parentEl.ref.start)}  `;
    const block = reindentBlock(raw, oldIndent, destChildIndent);
    const clamped = Math.max(0, Math.min(index, kids.length));
    if (clamped < kids.length) {
      const target = kids[clamped];
      if (!target) throw new Error("unreachable");
      const targetLine = lineStart(destCode, target.ref.start);
      const between = destCode.slice(targetLine, target.ref.start);
      const insert =
        targetLine > 0 &&
        destCode[targetLine - 1] === "\n" &&
        /^\s*$/.test(between)
          ? {
              file: parentEl.ref.file,
              start: targetLine,
              end: targetLine,
              text: `${block}\n`,
            }
          : {
              file: parentEl.ref.file,
              start: target.ref.start,
              end: target.ref.start,
              text: block,
            };
      return [
        { file: el.ref.file, start: del.start, end: del.end, text: "" },
        insert,
      ];
    }
    if (parentEl.closingSpan) {
      const closing = parentEl.closingSpan;
      const closingLine = lineStart(destCode, closing.start);
      const between = destCode.slice(closingLine, closing.start);
      const insert =
        closingLine > 0 &&
        destCode[closingLine - 1] === "\n" &&
        /^\s*$/.test(between)
          ? {
              file: parentEl.ref.file,
              start: closingLine,
              end: closingLine,
              text: `${block}\n`,
            }
          : {
              file: parentEl.ref.file,
              start: closing.start,
              end: closing.start,
              text: block,
            };
      return [
        { file: el.ref.file, start: del.start, end: del.end, text: "" },
        insert,
      ];
    }
    const cut = selfClosingExpansionCut(destCode, parentEl);
    const parentIndent = lineIndentAt(destCode, parentEl.ref.start);
    const insertText = `>\n${block
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}\n${parentIndent}</${parentEl.tag}>`;
    return [
      { file: el.ref.file, start: del.start, end: del.end, text: "" },
      {
        file: parentEl.ref.file,
        start: cut,
        end: parentEl.openingSpan.end,
        text: insertText,
      },
    ];
  }

  addPage(name: string): TextEdit[] {
    const { file, text, model } = this.manifest();
    const takenSlugs = new Set<string>();
    for (const entry of model.entries)
      takenSlugs.add(slugify(entry.name ?? entry.id));
    let slug = slugify(name);
    let counter = 2;
    while (takenSlugs.has(slug) || this.plannedFiles.has(`pages/${slug}.tsx`)) {
      slug = `${slugify(name)}-${counter}`;
      counter++;
    }
    const pageFile = `pages/${slug}.tsx`;
    const component = pascalCase(slug);
    const pageText = [
      `import { Frame } from "@ombrique/runtime";`,
      ``,
      `export default function ${component}() {`,
      `  return (`,
      `    <Frame name=${JSON.stringify(name)} x={0} y={0} width={1440} height={900} fill="#ffffff">`,
      `    </Frame>`,
      `  );`,
      `}`,
      ``,
    ].join("\n");
    const itemText = `{ "id": ${JSON.stringify(slug)}, "name": ${JSON.stringify(name)}, "file": ${JSON.stringify(pageFile)} }`;
    const pages = model.pages;
    const manifestEdits: TextEdit[] = [];
    const lastItem = pages.items[pages.items.length - 1];
    if (lastItem) {
      const itemIndent = lineIndentAt(text, lastItem.start);
      manifestEdits.push({
        file,
        start: lastItem.end,
        end: lastItem.end,
        text: `,\n${itemIndent}${itemText}`,
      });
    } else {
      const arrayIndent = lineIndentAt(text, pages.start);
      manifestEdits.push({
        file,
        start: pages.end - 1,
        end: pages.end - 1,
        text: `\n${arrayIndent}  ${itemText}\n${arrayIndent}`,
      });
    }
    this.plannedFiles.add(pageFile);
    return [
      { file: pageFile, start: 0, end: 0, text: pageText },
      ...manifestEdits,
    ];
  }

  renamePage(pageId: string, name: string): TextEdit[] {
    const { file, model } = this.manifest();
    const entry = model.entries.find((e) => e.id === pageId);
    if (!entry) throw new Error(`page not found: ${pageId}`);
    if (!entry.nameValue)
      throw new Error(`page ${pageId} has no name to rename`);
    return [
      {
        file,
        start: entry.nameValue.start,
        end: entry.nameValue.end,
        text: JSON.stringify(name),
      },
    ];
  }

  deletePage(pageId: string): TextEdit[] {
    const { file, text, model } = this.manifest();
    const entry = model.entries.find((e) => e.id === pageId);
    if (!entry) throw new Error(`page not found: ${pageId}`);
    const start = entry.node.start;
    const end = entry.node.end;
    let cursor = end;
    while (
      cursor < text.length &&
      (text[cursor] === " " || text[cursor] === "\t")
    )
      cursor++;
    if (text[cursor] === ",") {
      this.deletedPageFile = entry.file;
      return [{ file, start, end: cursor + 1, text: "" }];
    }
    let back = start;
    while (back > 0 && (text[back - 1] === " " || text[back - 1] === "\t"))
      back--;
    this.deletedPageFile = entry.file;
    if (text[back - 1] === ",") {
      return [{ file, start: back - 1, end, text: "" }];
    }
    return [{ file, start, end, text: "" }];
  }
}

function locateInParsed(
  parsed: ParsedDesignFile,
  path: readonly number[],
): DesignElement | undefined {
  if (path.length === 0) return undefined;
  let current: DesignElement | undefined = parsed.root ?? undefined;
  for (let i = 1; i < path.length; i++) {
    if (!current) return undefined;
    current = current.children[path[i] as number];
  }
  return current;
}

export function planPatch(index: DesignIndex, command: EditCommand): PlanResult;
export function planPatch(
  index: DesignIndex,
  commands: EditCommand[],
): PlanResult;
export function planPatch(
  index: DesignIndex,
  input: EditCommand | EditCommand[],
): PlanResult {
  const commands = Array.isArray(input) ? input : [input];
  const planner = new Planner(index);
  for (const command of commands) {
    let edits: TextEdit[] = [];
    switch (command.kind) {
      case "setStyle":
        edits = planner.setStyle(command.target, command.declarations);
        break;
      case "setText":
        edits = planner.setText(command.target, command.text);
        break;
      case "setAttrs":
        edits = planner.setAttrs(command.target, command.attrs);
        break;
      case "createNodes":
        edits = planner.createNodes(
          command.parent,
          command.pageFile,
          command.index,
          command.specs,
        );
        break;
      case "deleteNodes":
        edits = planner.deleteNodes(command.targets);
        break;
      case "reparent":
        edits = planner.reparent(
          command.target,
          command.parent,
          command.pageFile,
          command.index,
        );
        break;
      case "addPage":
        edits = planner.addPage(command.name);
        break;
      case "renamePage":
        edits = planner.renamePage(command.pageId, command.name);
        break;
      case "deletePage":
        edits = planner.deletePage(command.pageId);
        break;
    }
    planner.apply(edits);
  }
  const meta: { deletedPageFile?: string } = {};
  if (planner.deletedPageFile !== undefined)
    meta.deletedPageFile = planner.deletedPageFile;
  return {
    edits: planner.edits,
    changedFiles: [...planner.changedFiles],
    meta,
  };
}
