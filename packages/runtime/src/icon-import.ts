import {
  encodeIconNodes,
  type IconNode,
  type IconSetDefinition,
  type IconSetKind,
} from "./icon-codec";

export interface SvgElement {
  tag: string;
  attrs: Record<string, string>;
  children: SvgElement[];
}

export interface SvgPaint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fillRule?: string;
}

export interface SvgPathItem extends SvgPaint {
  d: string;
}

export interface SvgVector {
  viewBox: string;
  width?: number;
  height?: number;
  paths: SvgPathItem[];
  diagnostics: string[];
}

export interface IconImportResult {
  set: IconSetDefinition;
  diagnostics: string[];
  skipped: string[];
}

const DEFAULT_ICON_BOX = "0 0 24 24";

const SHAPE_TAGS = new Set([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
]);

const IGNORED_TAGS = new Set(["defs", "title", "desc", "style", "metadata"]);

const UNSUPPORTED_TAGS = new Set([
  "use",
  "text",
  "tspan",
  "image",
  "symbol",
  "mask",
  "clipPath",
  "filter",
  "pattern",
]);

function number(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function format(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[1];
    if (raw === undefined) continue;
    attrs[raw] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

export function parseSvgElements(source: string): SvgElement[] {
  const roots: SvgElement[] = [];
  const stack: SvgElement[] = [];
  const pattern =
    /<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  for (const match of source.matchAll(pattern)) {
    const rawTag = match[2] ?? "";
    if (match[1] === "/") {
      stack.pop();
      continue;
    }
    const element: SvgElement = {
      tag: rawTag.toLowerCase(),
      attrs: parseAttributes(match[3] ?? ""),
      children: [],
    };
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else roots.push(element);
    if (match[4] !== "/") stack.push(element);
  }
  return roots;
}

function pointsToPath(points: string): string {
  const coordinates = points
    .trim()
    .split(/[\s,]+/)
    .map((entry) => Number.parseFloat(entry))
    .filter((entry) => Number.isFinite(entry));
  if (coordinates.length < 4) return "";
  const parts: string[] = [];
  for (let i = 0; i + 1 < coordinates.length; i += 2) {
    parts.push(
      `${i === 0 ? "M" : "L"}${format(coordinates[i] ?? 0)} ${format(coordinates[i + 1] ?? 0)}`,
    );
  }
  return parts.join("");
}

export function shapeToPath(
  tag: string,
  attrs: Record<string, string>,
): string | null {
  if (tag === "path") return attrs.d && attrs.d.trim() !== "" ? attrs.d : null;
  if (tag === "rect") {
    const x = number(attrs.x);
    const y = number(attrs.y);
    const width = number(attrs.width);
    const height = number(attrs.height);
    if (width <= 0 || height <= 0) return null;
    const radiusX = Math.min(
      attrs.rx !== undefined ? number(attrs.rx) : number(attrs.ry),
      width / 2,
    );
    const radiusY = Math.min(
      attrs.ry !== undefined ? number(attrs.ry) : number(attrs.rx),
      height / 2,
    );
    if (radiusX <= 0 || radiusY <= 0) {
      return `M${format(x)} ${format(y)}H${format(x + width)}V${format(y + height)}H${format(x)}Z`;
    }
    const rx = format(radiusX);
    const ry = format(radiusY);
    return [
      `M${format(x + radiusX)} ${format(y)}`,
      `H${format(x + width - radiusX)}`,
      `A${rx} ${ry} 0 0 1 ${format(x + width)} ${format(y + radiusY)}`,
      `V${format(y + height - radiusY)}`,
      `A${rx} ${ry} 0 0 1 ${format(x + width - radiusX)} ${format(y + height)}`,
      `H${format(x + radiusX)}`,
      `A${rx} ${ry} 0 0 1 ${format(x)} ${format(y + height - radiusY)}`,
      `V${format(y + radiusY)}`,
      `A${rx} ${ry} 0 0 1 ${format(x + radiusX)} ${format(y)}`,
      "Z",
    ].join("");
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = number(attrs.cx);
    const cy = number(attrs.cy);
    const rx = tag === "circle" ? number(attrs.r) : number(attrs.rx);
    const ry = tag === "circle" ? number(attrs.r) : number(attrs.ry);
    if (rx <= 0 || ry <= 0) return null;
    return `M${format(cx - rx)} ${format(cy)}A${format(rx)} ${format(ry)} 0 0 1 ${format(cx + rx)} ${format(cy)}A${format(rx)} ${format(ry)} 0 0 1 ${format(cx - rx)} ${format(cy)}Z`;
  }
  if (tag === "line") {
    return `M${format(number(attrs.x1))} ${format(number(attrs.y1))}L${format(number(attrs.x2))} ${format(number(attrs.y2))}`;
  }
  if (tag === "polyline" || tag === "polygon") {
    const path = pointsToPath(attrs.points ?? "");
    if (path === "") return null;
    return tag === "polygon" ? `${path}Z` : path;
  }
  return null;
}

function parseStyleAttribute(
  style: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const declaration of style.split(";")) {
    const at = declaration.indexOf(":");
    if (at <= 0) continue;
    const key = declaration.slice(0, at).trim();
    const value = declaration.slice(at + 1).trim();
    if (key !== "" && value !== "") out[key] = value;
  }
  return out;
}

function paintOf(parent: SvgPaint, attrs: Record<string, string>): SvgPaint {
  const style = parseStyleAttribute(attrs.style);
  const read = (name: string): string | undefined => {
    const raw = attrs[name] ?? style[name];
    return raw === undefined ? undefined : raw.trim();
  };
  const strokeWidth = read("stroke-width");
  return {
    fill: read("fill") ?? parent.fill,
    stroke: read("stroke") ?? parent.stroke,
    strokeWidth:
      strokeWidth === undefined
        ? parent.strokeWidth
        : number(strokeWidth, parent.strokeWidth ?? 1),
    fillRule: read("fill-rule") ?? parent.fillRule,
  };
}

function collectPaths(
  element: SvgElement,
  parentPaint: SvgPaint,
  diagnostics: string[],
  paths: SvgPathItem[],
): void {
  const paint = paintOf(parentPaint, element.attrs);
  if (element.attrs.transform !== undefined) {
    diagnostics.push(
      `transform="${element.attrs.transform}" on <${element.tag}> is not applied`,
    );
  }
  if (SHAPE_TAGS.has(element.tag)) {
    const d = shapeToPath(element.tag, element.attrs);
    if (d) paths.push({ d, ...paint });
    else diagnostics.push(`<${element.tag}> has no usable geometry`);
    return;
  }
  if (element.tag === "g" || element.tag === "svg") {
    for (const child of element.children) {
      collectPaths(child, paint, diagnostics, paths);
    }
    return;
  }
  if (IGNORED_TAGS.has(element.tag)) return;
  if (UNSUPPORTED_TAGS.has(element.tag)) {
    diagnostics.push(`<${element.tag}> is not supported`);
    return;
  }
  diagnostics.push(`unknown element <${element.tag}>`);
}

export function parseSvgFragment(source: string): {
  paths: SvgPathItem[];
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const paths: SvgPathItem[] = [];
  for (const element of parseSvgElements(source)) {
    collectPaths(element, {}, diagnostics, paths);
  }
  return { paths, diagnostics };
}

export function parseSvgVector(source: string): SvgVector {
  const diagnostics: string[] = [];
  const root = parseSvgElements(source).find(
    (element) => element.tag === "svg",
  );
  if (!root) throw new Error("svg document has no <svg> element");
  const width =
    root.attrs.width !== undefined ? number(root.attrs.width) : undefined;
  const height =
    root.attrs.height !== undefined ? number(root.attrs.height) : undefined;
  const raw = root.attrs.viewBox?.trim() ?? "";
  let viewBox = raw;
  if (viewBox.split(/[\s,]+/).length !== 4) {
    if (
      width !== undefined &&
      height !== undefined &&
      width > 0 &&
      height > 0
    ) {
      viewBox = `0 0 ${format(width)} ${format(height)}`;
      diagnostics.push("viewBox missing; derived from width/height");
    } else {
      viewBox = DEFAULT_ICON_BOX;
      diagnostics.push("viewBox missing; falling back to 0 0 24 24");
    }
  }
  const paths: SvgPathItem[] = [];
  collectPaths(root, {}, diagnostics, paths);
  return { viewBox, width, height, paths, diagnostics };
}

export function svgVectorToNodes(paths: readonly SvgPathItem[]): IconNode[] {
  return paths.map((path) => {
    const attrs: Record<string, string> = { d: path.d };
    if (path.fill !== undefined) attrs.fill = path.fill;
    if (path.stroke !== undefined) attrs.stroke = path.stroke;
    if (path.strokeWidth !== undefined) {
      attrs["stroke-width"] = format(path.strokeWidth);
    }
    if (path.fillRule !== undefined) attrs["fill-rule"] = path.fillRule;
    return { tag: "path", attrs };
  });
}

export function svgToIconNodes(source: string): {
  viewBox: string;
  nodes: IconNode[];
  diagnostics: string[];
} {
  const vector = parseSvgVector(source);
  return {
    viewBox: vector.viewBox,
    nodes: svgVectorToNodes(vector.paths),
    diagnostics: vector.diagnostics,
  };
}

function parseIconNodes(source: string): {
  nodes: IconNode[];
  diagnostics: string[];
} {
  const fragment = parseSvgFragment(source);
  return {
    nodes: svgVectorToNodes(fragment.paths),
    diagnostics: fragment.diagnostics,
  };
}

interface IconifyEntry {
  body?: unknown;
  width?: unknown;
  height?: unknown;
  left?: unknown;
  top?: unknown;
  rotate?: unknown;
  hFlip?: unknown;
  vFlip?: unknown;
  parent?: unknown;
}

interface IconBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

function readBox(entry: IconifyEntry, base: IconBox): IconBox {
  return {
    width: typeof entry.width === "number" ? entry.width : base.width,
    height: typeof entry.height === "number" ? entry.height : base.height,
    left: typeof entry.left === "number" ? entry.left : base.left,
    top: typeof entry.top === "number" ? entry.top : base.top,
  };
}

function boxToString(box: IconBox): string {
  return `${format(box.left)} ${format(box.top)} ${format(box.width)} ${format(box.height)}`;
}

function detectKind(bodies: readonly string[]): IconSetKind {
  let stroke = 0;
  let fill = 0;
  for (const body of bodies) {
    if (/stroke\s*=\s*"currentColor"/.test(body) || /stroke-width/.test(body)) {
      stroke += 1;
    } else if (/fill\s*=\s*"(?!none)/.test(body)) {
      fill += 1;
    }
  }
  return stroke > fill ? "stroke" : "fill";
}

function detectStrokeWidth(bodies: readonly string[]): number {
  for (const body of bodies) {
    const match = /stroke-width\s*=\s*"([\d.]+)"/.exec(body);
    const raw = match?.[1];
    if (raw !== undefined) {
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 2;
}

function stripSetPaint(
  nodes: readonly IconNode[],
  strokeWidth: number,
): IconNode[] {
  return nodes.map((node) => {
    const attrs = { ...node.attrs };
    if (attrs.fill === "none") delete attrs.fill;
    if (attrs.stroke === "currentColor") delete attrs.stroke;
    if (attrs["stroke-width"] === format(strokeWidth)) {
      delete attrs["stroke-width"];
    }
    return { tag: node.tag, attrs };
  });
}

export function parseIconifySet(
  input: unknown,
  options: { name?: string } = {},
): IconImportResult {
  if (!input || typeof input !== "object") {
    throw new Error("iconify set must be an object");
  }
  const source = input as {
    prefix?: unknown;
    width?: unknown;
    height?: unknown;
    left?: unknown;
    top?: unknown;
    icons?: unknown;
    aliases?: unknown;
    chars?: unknown;
  };
  const name =
    options.name ?? (typeof source.prefix === "string" ? source.prefix : "");
  if (name === "") {
    throw new Error("iconify set has no prefix and no name option");
  }

  const defaults: IconBox = {
    width: typeof source.width === "number" ? source.width : 24,
    height: typeof source.height === "number" ? source.height : 24,
    left: typeof source.left === "number" ? source.left : 0,
    top: typeof source.top === "number" ? source.top : 0,
  };
  const iconEntries = (source.icons ?? {}) as Record<string, IconifyEntry>;
  const aliasEntries = (source.aliases ?? {}) as Record<string, IconifyEntry>;
  const diagnostics: string[] = [];
  const skipped: string[] = [];
  if (source.chars !== undefined) {
    diagnostics.push("chars are ignored; icons are addressed by name only");
  }

  const bodies = [...Object.values(iconEntries), ...Object.values(aliasEntries)]
    .map((entry) => entry?.body)
    .filter((body): body is string => typeof body === "string");
  const kind = detectKind(bodies);
  const defaultStrokeWidth = detectStrokeWidth(bodies);

  const resolve = (
    entryName: string,
    depth = 0,
  ): { body: string; box: IconBox; canonical: string } | null => {
    if (depth > 8) return null;
    const entry = iconEntries[entryName] ?? aliasEntries[entryName];
    if (!entry) return null;
    if (
      entry.rotate !== undefined ||
      entry.hFlip === true ||
      entry.vFlip === true
    ) {
      diagnostics.push(
        `${entryName}: rotate/hFlip/vFlip aliases are not supported`,
      );
      return null;
    }
    const box = readBox(entry, defaults);
    if (typeof entry.body === "string") {
      return { body: entry.body, box, canonical: entryName };
    }
    if (typeof entry.parent === "string") {
      const parent = resolve(entry.parent, depth + 1);
      if (!parent) return null;
      return { body: parent.body, box, canonical: parent.canonical };
    }
    diagnostics.push(`${entryName}: entry has neither body nor parent`);
    return null;
  };

  const icons: Record<string, string> = {};
  const aliases: Record<string, string> = {};
  const iconViewBoxes: Record<string, string> = {};
  const defaultBox = boxToString(defaults);
  const names = [
    ...Object.keys(iconEntries),
    ...Object.keys(aliasEntries),
  ].sort();

  for (const entryName of names) {
    const resolved = resolve(entryName);
    if (!resolved) {
      if (!skipped.includes(entryName)) skipped.push(entryName);
      continue;
    }
    const box = boxToString(resolved.box);
    const canonicalEntry = iconEntries[resolved.canonical];
    if (
      resolved.canonical !== entryName &&
      canonicalEntry !== undefined &&
      box === boxToString(readBox(canonicalEntry, defaults))
    ) {
      aliases[entryName] = resolved.canonical;
      continue;
    }
    const parsed = parseIconNodes(resolved.body);
    if (parsed.nodes.length === 0) {
      diagnostics.push(`${entryName}: body produced no drawable paths`);
      skipped.push(entryName);
      continue;
    }
    for (const note of parsed.diagnostics) {
      diagnostics.push(`${entryName}: ${note}`);
    }
    icons[entryName] = encodeIconNodes(
      stripSetPaint(parsed.nodes, defaultStrokeWidth),
    );
    if (box !== defaultBox) iconViewBoxes[entryName] = box;
  }

  const set: IconSetDefinition = {
    name,
    kind,
    viewBox: defaultBox,
    defaultStrokeWidth: kind === "stroke" ? defaultStrokeWidth : 0,
    icons,
    aliases,
  };
  if (Object.keys(iconViewBoxes).length > 0) set.iconViewBoxes = iconViewBoxes;
  return { set, diagnostics, skipped };
}
