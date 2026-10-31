import type {
  Declaration,
  EditCommand,
  NodeRef,
  NodeSpec,
  VariantAxis,
} from "../../protocol/src/index.js";
import { tokenModeNameSchema } from "../../protocol/src/index.js";
import { parseStylesheet, parseTokenTable } from "./parse-stylesheet.js";
import { applyEdits } from "./apply-edits.js";
import type { DesignIndex } from "./build-index.js";
import { parseDesignFile } from "./parse-design-file.js";
import type {
  DesignElement,
  ParsedDesignFile,
  PlanResult,
  Span,
  StylesheetRule,
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
  if (spec.kind === "text") {
    const style = [
      `position: "absolute"`,
      `left: ${spec.x}`,
      `top: ${spec.y}`,
      `width: ${spec.width}`,
    ];
    if (spec.fontSize !== undefined) style.push(`fontSize: ${spec.fontSize}`);
    if (spec.fill !== undefined)
      style.push(`color: ${JSON.stringify(spec.fill)}`);
    const styleAttr = `style={{ ${style.join(", ")} }}`;
    return `<Text ${styleAttr}>${escapeJsxText(spec.text)}</Text>`;
  }
  if (spec.kind === "component") {
    const propsList: string[] = [];
    if (spec.name) propsList.push(`data-name=${JSON.stringify(spec.name)}`);
    if (spec.x !== undefined) propsList.push(`x={${spec.x}}`);
    if (spec.y !== undefined) propsList.push(`y={${spec.y}}`);
    if (spec.props) {
      for (const [k, v] of Object.entries(spec.props)) {
        if (typeof v === "string") propsList.push(`${k}=${JSON.stringify(v)}`);
        else propsList.push(`${k}={${v}}`);
      }
    }
    const propStr = propsList.length > 0 ? ` ${propsList.join(" ")}` : "";
    return `<${spec.componentName}${propStr} />`;
  }
  const nameAttr = `data-name=${JSON.stringify(spec.name)}`;
  if (spec.kind === "image") {
    const style = [
      `position: "absolute"`,
      `left: ${spec.x}`,
      `top: ${spec.y}`,
      `width: ${spec.width}`,
      `height: ${spec.height}`,
    ];
    const styleAttr = `style={{ ${style.join(", ")} }}`;
    const radiusAttr =
      spec.radius !== undefined ? ` radius={${spec.radius}}` : "";
    return `<Image ${nameAttr} ${styleAttr} src=${JSON.stringify(spec.src)}${radiusAttr} />`;
  }
  const fillAttr =
    spec.fill !== undefined
      ? ` fill=${JSON.stringify(spec.fill)}`
      : ` fill="#d9d9d9"`;
  const geomAttrs = `x={${spec.x}} y={${spec.y}} width={${spec.width}} height={${spec.height}}`;
  if (spec.kind === "path") {
    const dAttr = ` d=${JSON.stringify(spec.d)}`;
    const strokeAttr =
      spec.stroke !== undefined ? ` stroke=${JSON.stringify(spec.stroke)}` : "";
    const strokeWidthAttr =
      spec.strokeWidth !== undefined
        ? ` strokeWidth={${spec.strokeWidth}}`
        : "";
    return `<Path ${nameAttr} ${geomAttrs}${dAttr}${fillAttr}${strokeAttr}${strokeWidthAttr} />`;
  }
  if (spec.kind === "frame")
    return `<Frame ${nameAttr} ${geomAttrs}${fillAttr} />`;
  if (spec.kind === "rect")
    return `<Rect ${nameAttr} ${geomAttrs}${fillAttr} />`;
  if (spec.kind === "ellipse")
    return `<Ellipse ${nameAttr} ${geomAttrs}${fillAttr} />`;
  return `<Star ${nameAttr} ${geomAttrs}${fillAttr} />`;
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

function remapEdit(edit: TextEdit, applied: TextEdit[]): TextEdit {
  if (applied.length === 0) return edit;
  const sorted = [...applied].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const mapPos = (offset: number): number => {
    let shift = 0;
    for (const earlier of sorted) {
      const delta = earlier.text.length - (earlier.end - earlier.start);
      const curStart = earlier.start + shift;
      const curEnd = earlier.end + shift;
      if (offset <= curStart) return offset - shift;
      if (offset < curEnd) {
        throw new Error(
          "planned edit overlaps an earlier edit in the same transaction",
        );
      }
      shift += delta;
    }
    return offset - shift;
  };
  return { ...edit, start: mapPos(edit.start), end: mapPos(edit.end) };
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
  if (pagesProp?.value.kind !== "array")
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
    if (slash >= open.start) {
      let pos = slash;
      if (code[pos - 1] === " " || code[pos - 1] === "\t") pos--;
      return pos;
    }
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
    const firstKid = kids[0];
    const childIndent = firstKid
      ? lineIndentAt(code, firstKid.ref.start)
      : `${between}  `;
    if (
      closingLine > 0 &&
      code[closingLine - 1] === "\n" &&
      /^\s*$/.test(between)
    ) {
      return {
        file: parent.ref.file,
        start: closingLine,
        end: closingLine,
        text: `${childIndent}${elemBlock}\n`,
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
      const base = this.texts.get(file) ?? "";
      this.texts.set(file, applyEdits(base, fileEdits));
      this.parsedCache.delete(file);
      if (file === this.index.manifestFile) this.manifestCache = null;
      this.changedFiles.add(file);
    }
    const appliedByFile = new Map<string, TextEdit[]>();
    for (const edit of commandEdits) {
      const applied =
        appliedByFile.get(edit.file) ??
        this.edits.filter((e) => e.file === edit.file);
      if (!appliedByFile.has(edit.file)) appliedByFile.set(edit.file, applied);
      this.edits.push(remapEdit(edit, applied));
    }
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
        const trimmed = value.trim();
        if (
          name === "onHoverStyle" &&
          trimmed.startsWith("{") &&
          trimmed.endsWith("}")
        ) {
          text = `${name}={${trimmed}}`;
        } else {
          text = `${name}=${JSON.stringify(value)}`;
        }
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
    const edits: TextEdit[] = [
      planChildInsert(code, parentEl, index, elemBlock),
    ];
    const primitiveByKind: Record<string, string> = {
      frame: "Frame",
      rect: "Rect",
      ellipse: "Ellipse",
      star: "Star",
      path: "Path",
      text: "Text",
      image: "Image",
    };
    const needed = specs
      .map((spec) => primitiveByKind[spec.kind])
      .filter((name): name is string => Boolean(name));
    const importEdit = this.ensureRuntimeImports(parentEl.ref.file, needed);
    if (importEdit) edits.push(importEdit);
    for (const spec of specs) {
      if (spec.kind === "component") {
        const importPath = parentEl.ref.file.startsWith("pages/")
          ? `../components/${spec.componentName}`
          : `./${spec.componentName}`;
        const importLine = `import { ${spec.componentName} } from "${importPath}";\n`;
        if (
          !code.includes(importLine) &&
          !code.includes(`import { ${spec.componentName} }`)
        ) {
          edits.push({
            file: parentEl.ref.file,
            start: 0,
            end: 0,
            text: importLine,
          });
        }
      }
    }
    return edits;
  }

  duplicateNode(target: NodeRef, dx: number, dy: number): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    const raw = code.slice(el.ref.start, el.ref.end);
    const base = el.ref.start;
    const shifted: TextEdit[] = [];
    const left = el.style.find((prop) => prop.key === "left");
    if (left?.valueSpan && typeof left.value === "number")
      shifted.push({
        file: el.ref.file,
        start: left.valueSpan.start - base,
        end: left.valueSpan.end - base,
        text: String(left.value + dx),
      });
    const top = el.style.find((prop) => prop.key === "top");
    if (top?.valueSpan && typeof top.value === "number")
      shifted.push({
        file: el.ref.file,
        start: top.valueSpan.start - base,
        end: top.valueSpan.end - base,
        text: String(top.value + dy),
      });
    const xAttr = el.attrs.x;
    if (xAttr && xAttr.kind === "number" && typeof xAttr.value === "number")
      shifted.push({
        file: el.ref.file,
        start: xAttr.valueSpan.start - base,
        end: xAttr.valueSpan.end - base,
        text: String(xAttr.value + dx),
      });
    const yAttr = el.attrs.y;
    if (yAttr && yAttr.kind === "number" && typeof yAttr.value === "number")
      shifted.push({
        file: el.ref.file,
        start: yAttr.valueSpan.start - base,
        end: yAttr.valueSpan.end - base,
        text: String(yAttr.value + dy),
      });
    const block = applyEdits(raw, shifted);
    const indent = lineIndentAt(code, el.ref.start);
    const nl = code.indexOf("\n", el.ref.end);
    if (nl === -1) {
      return [
        {
          file: el.ref.file,
          start: code.length,
          end: code.length,
          text: `\n${indent}${block}`,
        },
      ];
    }
    const nextLine = nl + 1;
    return [
      {
        file: el.ref.file,
        start: nextLine,
        end: nextLine,
        text: `${indent}${block}\n`,
      },
    ];
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

  groupNodes(
    targets: NodeRef[],
    parent: NodeRef | null,
    pageFile: string,
    _index: number,
    name: string,
  ): TextEdit[] {
    const parentEl = parent ? this.anchor(parent) : this.pageRoot(pageFile);
    const els = targets.map((t) => this.anchor(t));
    for (const el of els) {
      if (
        el.ref.file === parentEl.ref.file &&
        parentEl.ref.start >= el.ref.start &&
        parentEl.ref.end <= el.ref.end
      ) {
        throw new Error("cannot group a target into its own subtree");
      }
    }
    const files = new Set(els.map((el) => el.ref.file));
    if (files.size > 1)
      throw new Error("groupNodes targets must live in the same file");
    const firstEl = els[0];
    if (!firstEl) throw new Error("groupNodes requires at least one target");
    const file = firstEl.ref.file;
    const code = this.textOf(file);
    if (parentEl.ref.file !== file)
      throw new Error("group parent must be in the same file as targets");
    const sorted = [...els].sort((a, b) => a.ref.start - b.ref.start);
    let cursor = -1;
    for (const el of sorted) {
      if (el.ref.start < cursor)
        throw new Error("groupNodes targets must be disjoint");
      cursor = el.ref.end;
    }
    const sharedParent = (el: DesignElement): boolean =>
      el.parent !== null &&
      parentEl.ref.start === el.parent.ref.start &&
      parentEl.ref.end === el.parent.ref.end;
    for (const el of sorted) {
      let current: DesignElement | null = el;
      let ok = false;
      while (current) {
        if (sharedParent(current)) {
          ok = true;
          break;
        }
        current = current.parent;
      }
      if (!ok)
        throw new Error("groupNodes targets must share the group parent");
    }
    const groupIndent = lineIndentAt(code, parentEl.ref.start);
    const childIndent = `${groupIndent}  `;
    const raw = sorted
      .map((el) => {
        const start = el.ref.start;
        const end = el.ref.end;
        const rawEl = code.slice(start, end);
        return reindentBlock(rawEl, lineIndentAt(code, start), "");
      })
      .join("\n");
    const inner = raw
      .split("\n")
      .map((line) => (line.length > 0 ? `${childIndent}${line}` : line))
      .join("\n");
    const groupBlock = `<Group data-name=${JSON.stringify(name)}>\n${inner}\n${childIndent}</Group>`;
    const spans = sorted.map((el) => deletionSpan(code, el));
    const merged = mergeSpans(spans);
    const firstSpan = merged[0];
    const lastSpan = merged[merged.length - 1];
    const firstSorted = sorted[0];
    const lastSorted = sorted[sorted.length - 1];
    if (!firstSpan || !lastSpan || !firstSorted || !lastSorted)
      throw new Error("groupNodes requires at least one target");
    const delStart = firstSpan.start;
    const delEnd = lastSpan.end;
    const leading = code.slice(delStart, firstSorted.ref.start);
    const leadingIndent = /^[ \t]*$/.test(leading) ? leading : "";
    const trailing = code.slice(lastSorted.ref.end, delEnd);
    const trailingWs = /^[ \t]*\r?\n?$/.test(trailing)
      ? trailing.replace(/^[ \t]*/, "")
      : "";
    const text = `${leadingIndent}${groupBlock}${trailingWs}`;
    const edits: TextEdit[] = [
      {
        file,
        start: delStart,
        end: delEnd,
        text,
      },
    ];
    const importEdit = this.ensureRuntimeImports(file, ["Group"]);
    if (importEdit) edits.push(importEdit);
    return edits;
  }

  ungroupNode(target: NodeRef): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    if (el.children.length === 0)
      throw new Error("ungroupNode requires a Group with children");
    const kids = el.children;
    const first = kids[0];
    const last = kids[kids.length - 1];
    if (!first || !last)
      throw new Error("ungroupNode requires a Group with children");
    const groupIndent = lineIndentAt(code, el.ref.start);
    const childIndent = lineIndentAt(code, first.ref.start);
    const raw = code.slice(first.ref.start, last.ref.end);
    const block = reindentBlock(raw, childIndent, groupIndent);
    const span = deletionSpan(code, el);
    const closingLine = lineStart(code, el.closingSpan?.start ?? el.ref.end);
    const between = code.slice(
      closingLine,
      el.closingSpan?.start ?? el.ref.end,
    );
    const needsNewline = /^\n?[ \t]*$/.test(between);
    if (!needsNewline) {
      return [
        { file: el.ref.file, start: span.start, end: span.end, text: block },
      ];
    }
    const spanEndInclusive = (() => {
      const end = el.ref.end;
      if (code[end] === "\r" && code[end + 1] === "\n") return end + 2;
      if (code[end] === "\n") return end + 1;
      return end;
    })();
    void spanEndInclusive;
    const text = `${block}\n`;
    return [
      {
        file: el.ref.file,
        start: span.start,
        end: span.end,
        text,
      },
    ];
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
    const insertText = `>\n${block}\n${parentIndent}</${parentEl.tag}>`;
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

  setSharedStyle(
    file: string,
    start: number,
    end: number,
    value: string,
  ): TextEdit[] {
    if (file.includes("..") || file.startsWith("/") || file.includes("\\")) {
      throw new Error("path traversal rejected");
    }
    const code = this.textOf(file);
    if (start < 0 || end > code.length || start > end) {
      throw new Error("declaration value span out of bounds");
    }
    return [{ file, start, end, text: value }];
  }

  private ensureRuntimeImports(
    file: string,
    needed: Iterable<string>,
  ): TextEdit | null {
    const wanted = [...new Set(needed)];
    if (wanted.length === 0) return null;
    const code = this.textOf(file);
    const importPattern =
      /import\s*\{([^}]*)\}\s*from\s*"@ombrique\/runtime";?/;
    const match = importPattern.exec(code);
    if (!match) {
      return {
        file,
        start: 0,
        end: 0,
        text: `import { ${wanted.join(", ")} } from "@ombrique/runtime";\n`,
      };
    }
    const existing = (match[1] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const missing = wanted.filter((name) => !existing.includes(name));
    if (missing.length === 0) return null;
    let closing = match.index + match[0].lastIndexOf("}");
    while (closing > 0 && /[ \t]/.test(code[closing - 1] ?? "")) closing -= 1;
    return {
      file,
      start: closing,
      end: closing,
      text: `${existing.length > 0 ? ", " : " "}${missing.join(", ")}`,
    };
  }

  private normalizeTokenName(name: string): string {
    const trimmed = name.trim();
    return trimmed.startsWith("--") ? trimmed : `--${trimmed}`;
  }

  private tokenTable() {
    const code = this.texts.get("tokens.css");
    return parseTokenTable(
      code === undefined ? undefined : parseStylesheet("tokens.css", code),
    );
  }

  private insertToken(
    rule: StylesheetRule,
    prop: string,
    value: string,
  ): TextEdit[] {
    const file = "tokens.css";
    const code = this.textOf(file);
    const closing = rule.ruleSpan.end - 1;
    const closingLine = lineStart(code, closing);
    const ownLine = code.slice(closingLine, closing).trim().length === 0;
    const first = rule.decls[0];
    const indent = first
      ? code.slice(lineStart(code, first.propSpan.start), first.propSpan.start)
      : "  ";
    const indentation = /^\s*$/.test(indent) ? indent : "  ";
    const start = ownLine ? closingLine : closing;
    const last = rule.decls.at(-1);
    const needsSemicolon =
      last &&
      !code.slice(last.valueSpan.end, start).trimStart().startsWith(";");
    const separator = needsSemicolon ? ";" : "";
    const text = ownLine
      ? `${separator}${indentation}${prop}: ${value};\n`
      : `${separator}\n${indentation}${prop}: ${value};\n`;
    return [{ file, start, end: start, text }];
  }

  setTokenValue(name: string, value: string, modeName?: string): TextEdit[] {
    const prop = this.normalizeTokenName(name);
    const table = this.tokenTable();
    const mode =
      modeName === undefined
        ? table.modes.find((item) => item.isDefault)
        : table.modes.find((item) => item.name === modeName);
    if (!mode) throw new Error(`Unknown token mode: ${modeName}`);
    for (const rule of [...mode.rules].reverse()) {
      const decl = [...rule.decls].reverse().find((item) => item.prop === prop);
      if (decl)
        return [
          {
            file: "tokens.css",
            start: decl.valueSpan.start,
            end: decl.valueSpan.end,
            text: value,
          },
        ];
    }
    const rule = mode.rules.at(-1);
    if (rule) return this.insertToken(rule, prop, value);
    return this.createToken(name, value);
  }

  createToken(name: string, value: string): TextEdit[] {
    const file = "tokens.css";
    const prop = this.normalizeTokenName(name);
    const code = this.texts.get(file) ?? "";
    const root = this.tokenTable()
      .modes.find((mode) => mode.isDefault)
      ?.rules.at(-1);
    if (root) return this.insertToken(root, prop, value);
    const text = `${code.trim().length > 0 ? "\n" : ""}:root {\n  ${prop}: ${value};\n}\n`;
    return [{ file, start: code.length, end: code.length, text }];
  }

  addTokenMode(name: string): TextEdit[] {
    tokenModeNameSchema.parse(name);
    const table = this.tokenTable();
    if (table.modes.some((mode) => mode.name === name))
      throw new Error(`Token mode already exists: ${name}`);
    const code = this.texts.get("tokens.css") ?? "";
    const declarations = table.tokens
      .filter((token) => token.value !== "")
      .map((token) => `  ${token.name}: ${token.value};`)
      .join("\n");
    const root = table.modes.find((mode) => mode.isDefault);
    const prefix = root?.rules.length ? "" : ":root {\n}\n";
    const text = `${prefix}\n[data-mode="${name}"] {\n${declarations}${declarations ? "\n" : ""}}\n`;
    return [{ file: "tokens.css", start: code.length, end: code.length, text }];
  }

  private modeReferences(name: string, value: string | null): TextEdit[] {
    const edits: TextEdit[] = [];
    for (const [file] of this.texts) {
      if (!file.endsWith(".tsx")) continue;
      for (const element of this.parsedOf(file).elements) {
        const mode = element.attrs.mode;
        if (element.tag === "Frame" && mode?.value === name) {
          if (value === null) {
            const code = this.textOf(file);
            const start = /[ \t]/.test(code[mode.attrSpan.start - 1] ?? "")
              ? mode.attrSpan.start - 1
              : mode.attrSpan.start;
            edits.push({ file, start, end: mode.attrSpan.end, text: "" });
          } else if (mode.valueSpan) {
            edits.push({
              file,
              start: mode.valueSpan.start,
              end: mode.valueSpan.end,
              text: JSON.stringify(value),
            });
          }
        }
      }
    }
    return edits;
  }

  renameTokenMode(name: string, newName: string): TextEdit[] {
    tokenModeNameSchema.parse(newName);
    const table = this.tokenTable();
    const mode = table.modes.find((item) => item.name === name);
    if (!mode) throw new Error(`Unknown token mode: ${name}`);
    if (name === newName) return [];
    if (table.modes.some((item) => item.name === newName))
      throw new Error(`Token mode already exists: ${newName}`);
    const edits = this.modeReferences(name, newName);
    const code = this.texts.get("tokens.css") ?? "";
    if (!mode.rules.length)
      return [
        ...edits,
        {
          file: "tokens.css",
          start: code.length,
          end: code.length,
          text: `\n:root, [data-mode="${newName}"] {\n}\n`,
        },
      ];
    for (const rule of mode.rules) {
      const match =
        /\[data-mode\s*=\s*(?:"([^"\\]+)"|'([^'\\]+)'|([\w-]+))\s*\]/.exec(
          rule.selector,
        );
      if (match) {
        const oldName = match[1] ?? match[2] ?? match[3] ?? "";
        const equals = match[0].indexOf("=");
        const rawValue = match[0].slice(equals + 1).trimStart();
        const valueOffset =
          match[0].length - match[0].slice(equals + 1).trimStart().length;
        const quoted = rawValue.startsWith('"') || rawValue.startsWith("'");
        const start =
          rule.selectorSpan.start +
          match.index +
          valueOffset +
          (quoted ? 1 : 0);
        edits.push({
          file: "tokens.css",
          start,
          end: start + oldName.length,
          text: quoted ? newName : JSON.stringify(newName),
        });
      } else {
        edits.push({
          file: "tokens.css",
          start: rule.selectorSpan.end,
          end: rule.selectorSpan.end,
          text: `, [data-mode="${newName}"]`,
        });
      }
    }
    return edits;
  }

  deleteTokenMode(name: string): TextEdit[] {
    const mode = this.tokenTable().modes.find((item) => item.name === name);
    if (!mode) throw new Error(`Unknown token mode: ${name}`);
    if (mode.isDefault) throw new Error("Cannot delete the default token mode");
    const code = this.textOf("tokens.css");
    const spans = mode.rules
      .map((rule) => {
        let start = rule.ruleSpan.start;
        let end = rule.ruleSpan.end;
        while (start > 0 && /\s/.test(code[start - 1] ?? "")) start--;
        while (end < code.length && /\s/.test(code[end] ?? "")) end++;
        return { start, end };
      })
      .sort((a, b) => a.start - b.start);
    const merged: Span[] = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span.start <= last.end)
        last.end = Math.max(last.end, span.end);
      else merged.push(span);
    }
    return [
      ...this.modeReferences(name, null),
      ...merged.map((span) => ({
        file: "tokens.css",
        ...span,
        text: span.start > 0 ? "\n" : "",
      })),
    ];
  }

  createComponent(target: NodeRef, name: string): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    const componentFile = `components/${name}.tsx`;

    // 1. Extract raw JSX of the target
    const rawJsx = code.slice(el.ref.start, el.ref.end);

    // 2. Determine required @ombrique/runtime primitives
    const primitives = [
      "Frame",
      "Rect",
      "Ellipse",
      "Star",
      "Text",
      "Group",
      "Image",
      "Path",
    ];
    const needed = primitives.filter((p) => {
      const reTag = new RegExp(`<${p}\\b`);
      return reTag.test(rawJsx);
    });
    const importStmt =
      needed.length > 0
        ? `import { ${needed.join(", ")} } from "@ombrique/runtime";\n\n`
        : "";

    // 3. Construct component file content
    const componentContent = `${importStmt}export function ${name}() {\n  return (\n    ${rawJsx}\n  );\n}\n`;

    // 4. In caller file: replace target with <Name />
    // Also add import { Name } from "../components/Name" if not already imported
    const importPath = el.ref.file.startsWith("pages/")
      ? `../components/${name}`
      : `./${name}`;
    const importLine = `import { ${name} } from "${importPath}";\n`;

    const edits: TextEdit[] = [
      {
        file: componentFile,
        start: 0,
        end: 0,
        text: componentContent,
      },
    ];

    if (!code.includes(importLine) && !code.includes(`import { ${name} }`)) {
      // insert importLine at the very top of the caller file
      edits.push({
        file: el.ref.file,
        start: 0,
        end: 0,
        text: importLine,
      });
    }

    edits.push({
      file: el.ref.file,
      start: el.ref.start,
      end: el.ref.end,
      text: `<${name} />`,
    });

    return edits;
  }
  createVariantSet(
    targets: NodeRef[],
    name: string,
    axes: VariantAxis[],
  ): TextEdit[] {
    if (targets.length < 2) {
      throw new Error("createVariantSet requires at least 2 targets");
    }
    const elements = targets.map((t) => this.anchor(t));
    const first = elements[0];
    if (!first) {
      throw new Error("createVariantSet requires at least 2 targets");
    }
    const callerFile = first.ref.file;
    const code = this.textOf(callerFile);
    const componentFile = `components/${name}.tsx`;

    // 1. Generate cartesian product combinations of axis values
    const allCombos: Array<Record<string, string>> = [{}];
    for (const axis of axes) {
      const next: Array<Record<string, string>> = [];
      for (const item of allCombos) {
        for (const val of axis.values) {
          next.push({ ...item, [axis.name]: val });
        }
      }
      allCombos.length = 0;
      allCombos.push(...next);
    }
    const defaultCombo: Record<string, string> = allCombos[0] ?? {};

    // 2. Assign each target to a variant combo
    const targetCombos: Array<Record<string, string>> = [];
    const usedCombos = new Set<number>();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el) continue;
      const elName = (
        el.dataAttrs["data-name"] ??
        (typeof el.attrs.name?.value === "string" ? el.attrs.name.value : "")
      ).toLowerCase();

      let matchedIndex = -1;
      for (let c = 0; c < allCombos.length; c++) {
        if (usedCombos.has(c)) continue;
        const combo = allCombos[c];
        if (!combo) continue;
        const allMatch = Object.entries(combo).every(([axisName, axisVal]) => {
          const valLower = axisVal.toLowerCase();
          const axisLower = axisName.toLowerCase();
          return (
            elName.includes(`${axisLower}=${valLower}`) ||
            elName.includes(valLower) ||
            el.attrs[axisName]?.value === axisVal
          );
        });
        if (allMatch) {
          matchedIndex = c;
          break;
        }
      }

      if (matchedIndex === -1) {
        for (let c = 0; c < allCombos.length; c++) {
          if (!usedCombos.has(c)) {
            matchedIndex = c;
            break;
          }
        }
      }

      if (matchedIndex !== -1) {
        usedCombos.add(matchedIndex);
        targetCombos.push(allCombos[matchedIndex] ?? defaultCombo);
      } else {
        targetCombos.push(allCombos[i % allCombos.length] ?? defaultCombo);
      }
    }

    // 3. Extract raw JSX of all targets
    const rawJsxs = elements.map((el) =>
      code.slice(el.ref.start, el.ref.end).trim(),
    );

    // 4. Primitives from @ombrique/runtime
    const primitives = [
      "Frame",
      "Rect",
      "Ellipse",
      "Star",
      "Text",
      "Group",
      "Image",
      "Path",
    ];
    const needed = primitives.filter((p) => {
      const reTag = new RegExp(`<${p}\\b`);
      return rawJsxs.some((jsx) => reTag.test(jsx));
    });
    const importStmt =
      needed.length > 0
        ? `import { ${needed.join(", ")} } from "@ombrique/runtime";\n\n`
        : "";

    // 5. Props interface
    const propFields = axes
      .map(
        (axis) =>
          `  ${axis.name}?: ${axis.values.map((v) => JSON.stringify(v)).join(" | ")};`,
      )
      .join("\n");
    const propsInterface = `export interface ${name}Props {\n${propFields}\n}\n\n`;

    // 6. Variant axes metadata export
    const axesExport = `export const variantAxes = ${JSON.stringify(axes, null, 2)};\n\n`;

    // 7. Default parameters
    const defaultParams = axes
      .map((axis) => {
        const def =
          axis.values.find((v) => v === "default" || v === "medium") ??
          axis.values[0];
        return `${axis.name} = ${JSON.stringify(def)}`;
      })
      .join(", ");

    // 8. Generate function branches
    const baseIndex = 0;
    const branches: string[] = [];
    for (let j = 0; j < elements.length; j++) {
      if (j === baseIndex) continue;
      const combo = targetCombos[j] ?? defaultCombo;
      const conditions = Object.entries(combo)
        .map(([k, v]) => `${k} === ${JSON.stringify(v)}`)
        .join(" && ");
      branches.push(
        `  if (${conditions}) {\n    return (\n      ${rawJsxs[j]}\n    );\n  }`,
      );
    }
    const baseBranch = `  return (\n    ${rawJsxs[baseIndex]}\n  );`;

    const componentContent = `${importStmt}${propsInterface}${axesExport}export function ${name}({\n  ${defaultParams},\n}: ${name}Props) {\n${branches.length > 0 ? `${branches.join("\n\n")}\n\n` : ""}${baseBranch}\n}\n`;

    // 9. Edits
    const edits: TextEdit[] = [
      {
        file: componentFile,
        start: 0,
        end: 0,
        text: componentContent,
      },
    ];

    const importPath = callerFile.startsWith("pages/")
      ? `../components/${name}`
      : `./${name}`;
    const importLine = `import { ${name} } from "${importPath}";\n`;
    if (!code.includes(importLine) && !code.includes(`import { ${name} }`)) {
      edits.push({
        file: callerFile,
        start: 0,
        end: 0,
        text: importLine,
      });
    }

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el) continue;
      const combo = targetCombos[i] ?? defaultCombo;
      const propEntries = Object.entries(combo).map(
        ([k, v]) => `${k}=${JSON.stringify(v)}`,
      );
      const propStr = propEntries.length > 0 ? ` ${propEntries.join(" ")}` : "";
      edits.push({
        file: callerFile,
        start: el.ref.start,
        end: el.ref.end,
        text: `<${name}${propStr} />`,
      });
    }

    return edits;
  }

  detachInstance(target: NodeRef): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    const componentName = el.tag;

    // Look for component file in components/${componentName}.tsx
    const compFile = `components/${componentName}.tsx`;
    const compCode = this.index.sources.get(compFile);
    if (!compCode) {
      throw new Error(`cannot find component definition for ${componentName}`);
    }

    let inlinedJsx: string | null = null;
    const branches = [
      ...compCode.matchAll(
        /if\s*\(([^)]+)\)\s*\{\s*return\s*\(\s*([\s\S]*?)\s*\);?\s*\}/g,
      ),
    ];
    for (const b of branches) {
      const cond = b[1];
      const jsx = b[2]?.trim();
      if (!cond || !jsx) continue;
      const parts = cond.split("&&").map((s) => s.trim());
      const allMatch = parts.every((part) => {
        const m = part.match(/([a-zA-Z0-9_$]+)\s*===\s*"([^"]+)"/);
        if (!m?.[1] || !m[2]) return false;
        const axisName = m[1];
        const axisVal = m[2];
        return el.attrs[axisName]?.value === axisVal;
      });
      if (allMatch) {
        inlinedJsx = jsx;
        break;
      }
    }
    if (!inlinedJsx) {
      const returnMatches = [
        ...compCode.matchAll(/return\s*\(\s*([\s\S]*?)\s*\);?\s*\}/g),
      ];
      if (returnMatches.length > 0) {
        const last = returnMatches[returnMatches.length - 1];
        if (last?.[1]) inlinedJsx = last[1].trim();
      }
    }
    if (!inlinedJsx) {
      throw new Error(`could not extract JSX from ${compFile}`);
    }

    // Apply any override props present on the instance el.attrs
    // For each attr on instance (excluding className/style/data-), inject/override it on root element of inlinedJsx
    const overrideAttrs = Object.entries(el.attrs).filter(
      ([k]) => !k.startsWith("data-") && k !== "className" && k !== "style",
    );

    if (overrideAttrs.length > 0) {
      // Find the opening tag of inlinedJsx e.g. <Frame ...> or <Frame ... />
      const openTagMatch = inlinedJsx.match(
        /^<([A-Za-z0-9_]+)(\s[\s\S]*?)?(\/?>)/,
      );
      if (openTagMatch) {
        let tagAttrs = openTagMatch[2] ?? "";
        const tagCloser = openTagMatch[3] ?? ">";
        for (const [key, attrVal] of overrideAttrs) {
          const valStr =
            typeof attrVal.value === "string"
              ? `"${attrVal.value}"`
              : `{${JSON.stringify(attrVal.value)}}`;
          const attrPattern = new RegExp(`\\b${key}=(?:"[^"]*"|{[^}]*})`);
          if (attrPattern.test(tagAttrs)) {
            tagAttrs = tagAttrs.replace(attrPattern, `${key}=${valStr}`);
          } else {
            tagAttrs = `${tagAttrs} ${key}=${valStr}`;
          }
        }
        inlinedJsx = `<${openTagMatch[1]}${tagAttrs}${tagCloser}${inlinedJsx.slice(openTagMatch[0].length)}`;
      }
    }

    const edits: TextEdit[] = [
      {
        file: el.ref.file,
        start: el.ref.start,
        end: el.ref.end,
        text: inlinedJsx,
      },
    ];
    const primitives = new Set([
      "Frame",
      "Rect",
      "Ellipse",
      "Star",
      "Text",
      "Group",
      "Image",
      "Vector",
      "Boolean",
      "Path",
    ]);
    const usedPrimitives: string[] = [];
    for (const tagMatch of inlinedJsx.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
      const tag = tagMatch[1];
      if (tag && primitives.has(tag)) usedPrimitives.push(tag);
    }
    const primitiveImport = this.ensureRuntimeImports(
      el.ref.file,
      usedPrimitives,
    );
    if (primitiveImport) edits.push(primitiveImport);

    // Check if the component import should be removed if there are no other instances in the file
    const tagUsageCount = (
      code.match(new RegExp(`<${componentName}\\b`, "g")) ?? []
    ).length;
    if (tagUsageCount <= 1) {
      // Remove import line
      const importRegex = new RegExp(
        `import\\s*\\{\\s*${componentName}\\s*\\}\\s*from\\s*["'][^"']+["'];?\\r?\\n?`,
      );
      const m = code.match(importRegex);
      if (m && m.index !== undefined) {
        edits.push({
          file: el.ref.file,
          start: m.index,
          end: m.index + m[0].length,
          text: "",
        });
      }
    }

    return edits;
  }

  flattenBoolean(target: NodeRef): TextEdit[] {
    const el = this.anchor(target);
    const code = this.textOf(el.ref.file);
    const rawJsx = code.slice(el.ref.start, el.ref.end);

    // Extract fill and stroke from Boolean attributes if present
    const fillAttr = el.attrs.fill?.value ?? "#111111";
    const strokeAttr = el.attrs.stroke?.value;
    const strokeWidthAttr = el.attrs.strokeWidth?.value;

    // Collect child SVG geometries e.g. path d, rect, circle/ellipse
    const pathMatches = Array.from(
      rawJsx.matchAll(/<path[^>]*\bd=(?:"([^"]*)"|\{([^}]*)\})[^>]*\/?>/gi),
    );
    const pathsD: string[] = [];
    for (const m of pathMatches) {
      const d = m[1] ?? m[2];
      if (d) pathsD.push(d.replace(/['"]/g, "").trim());
    }

    // Also support <rect x="..." y="..." width="..." height="..." />
    const rectMatches = Array.from(
      rawJsx.matchAll(
        /<rect[^>]*\bx=\{?([0-9.]+)\}?[^>]*\by=\{?([0-9.]+)\}?[^>]*\bwidth=\{?([0-9.]+)\}?[^>]*\bheight=\{?([0-9.]+)\}?[^>]*\/?>/gi,
      ),
    );
    for (const m of rectMatches) {
      const x = Number(m[1] ?? 0);
      const y = Number(m[2] ?? 0);
      const w = Number(m[3] ?? 0);
      const h = Number(m[4] ?? 0);
      pathsD.push(`M${x} ${y} h${w} v${h} h${-w} Z`);
    }

    // Also support <circle cx="..." cy="..." r="..." />
    const circleMatches = Array.from(
      rawJsx.matchAll(
        /<circle[^>]*\bcx=\{?([0-9.]+)\}?[^>]*\bcy=\{?([0-9.]+)\}?[^>]*\br=\{?([0-9.]+)\}?[^>]*\/?>/gi,
      ),
    );
    for (const m of circleMatches) {
      const cx = Number(m[1] ?? 0);
      const cy = Number(m[2] ?? 0);
      const r = Number(m[3] ?? 0);
      pathsD.push(
        `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`,
      );
    }

    const mergedD =
      pathsD.length > 0 ? pathsD.join(" ") : "M0 0 L100 0 L100 100 L0 100 Z";

    let pathTag = `<path d="${mergedD}" fill="${fillAttr}"`;
    if (strokeAttr) pathTag += ` stroke="${strokeAttr}"`;
    if (strokeWidthAttr !== undefined)
      pathTag += ` strokeWidth={${strokeWidthAttr}}`;
    if (el.dataAttrs["data-name"])
      pathTag += ` data-name="${el.dataAttrs["data-name"]}"`;
    pathTag += " />";

    return [
      {
        file: el.ref.file,
        start: el.ref.start,
        end: el.ref.end,
        text: pathTag,
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
    const { file, model } = this.manifest();
    const itemIndex = model.entries.findIndex((e) => e.id === pageId);
    if (itemIndex < 0) throw new Error(`page not found: ${pageId}`);
    const entry = model.entries[itemIndex];
    if (!entry) throw new Error("unreachable");
    const items = model.pages.items;
    const node = entry.node;
    const prev = itemIndex > 0 ? items[itemIndex - 1] : undefined;
    const next = items[itemIndex + 1];
    this.deletedPageFile = entry.file;
    if (prev && next) {
      return [{ file, start: prev.end, end: node.end, text: "" }];
    }
    if (prev && !next) {
      return [{ file, start: prev.end, end: node.end, text: "" }];
    }
    if (!prev && next) {
      return [{ file, start: node.start, end: next.start, text: "" }];
    }
    return [{ file, start: node.start, end: node.end, text: "" }];
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

export function planPatch(
  index: DesignIndex,
  input: EditCommand | readonly EditCommand[],
): PlanResult {
  const commands: readonly EditCommand[] = Array.isArray(input)
    ? input
    : [input];
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
      case "duplicateNode":
        edits = planner.duplicateNode(command.target, command.dx, command.dy);
        break;
      case "groupNodes":
        edits = planner.groupNodes(
          command.targets,
          command.parent,
          command.pageFile,
          command.index,
          command.name,
        );
        break;
      case "ungroupNode":
        edits = planner.ungroupNode(command.target);
        break;
      case "reparent":
        edits = planner.reparent(
          command.target,
          command.parent,
          command.pageFile,
          command.index,
        );
        break;
      case "setSharedStyle":
        edits = planner.setSharedStyle(
          command.file,
          command.start,
          command.end,
          command.value,
        );
        break;
      case "setTokenValue":
        edits = planner.setTokenValue(
          command.name,
          command.value,
          command.mode,
        );
        break;
      case "createToken":
        edits = planner.createToken(command.name, command.value);
        break;
      case "addTokenMode":
        edits = planner.addTokenMode(command.name);
        break;
      case "renameTokenMode":
        edits = planner.renameTokenMode(command.name, command.newName);
        break;
      case "deleteTokenMode":
        edits = planner.deleteTokenMode(command.name);
        break;
      case "createComponent":
        edits = planner.createComponent(command.target, command.name);
        break;
      case "createVariantSet":
        edits = planner.createVariantSet(
          command.targets,
          command.name,
          command.axes,
        );
        break;
      case "detachInstance":
        edits = planner.detachInstance(command.target);
        break;
      case "flattenBoolean":
        edits = planner.flattenBoolean(command.target);
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
