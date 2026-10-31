import type { Manifest, VariantAxis } from "../../protocol/src/index.js";
import { parseDesignFile } from "./parse-design-file.js";
import {
  extractClasses,
  parseStylesheet,
  parseTokenTable,
} from "./parse-stylesheet.js";
import type {
  DesignElement,
  ParsedDesignFile,
  ParsedStylesheet,
  StylesheetRule,
  TokenTable,
} from "./types.js";

export interface ComponentInfo {
  name: string;
  file: string;
  frameName: string;
  root: DesignElement | null;
  axes: VariantAxis[];
}

export interface PageInfo {
  id: string;
  name: string;
  file: string;
  root: DesignElement | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  frameName: string;
}

export interface StylesIndex {
  byClass: ReadonlyMap<string, StylesheetRule[]>;
  files: ReadonlyMap<string, ParsedStylesheet>;
  tokens: TokenTable;
}

export interface DesignIndex {
  readonly pages: PageInfo[];
  readonly manifest: Manifest | null;
  readonly manifestFile: string | null;
  readonly byRef: (ref: {
    file: string;
    start: number;
    end: number;
  }) => DesignElement | undefined;
  readonly byPath: (
    file: string,
    path: readonly number[],
  ) => DesignElement | undefined;
  readonly elements: ReadonlyMap<string, DesignElement>;
  readonly styles: StylesIndex;
  readonly sources: ReadonlyMap<string, string>;
  readonly components: ComponentInfo[];
}

function byRefKey(file: string, start: number): string {
  return `${file}#${start}`;
}

function byPathKey(file: string, path: readonly number[]): string {
  return `${file}#/${path.join("/")}`;
}

function numericAttr(el: DesignElement | null, name: string): number | null {
  if (!el) return null;
  const attr = el.attrs[name];
  if (!attr) return null;
  if (attr.kind === "number" && typeof attr.value === "number")
    return attr.value;
  return null;
}

function pageNameOf(root: DesignElement | null, fallback: string): string {
  if (!root) return fallback;
  const dataName = root.dataAttrs["data-name"];
  if (dataName) return dataName;
  const nameAttr = root.attrs.name;
  if (
    nameAttr &&
    nameAttr.kind === "string" &&
    typeof nameAttr.value === "string"
  )
    return nameAttr.value;
  return fallback;
}
export function extractVariantAxes(code: string): VariantAxis[] {
  const axesMatch = code.match(
    /export\s+const\s+variantAxes\s*=\s*(\[[\s\S]*?\]);/,
  );
  if (axesMatch?.[1]) {
    try {
      const parsed = JSON.parse(axesMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as VariantAxis[];
      }
    } catch {
      // fallback to regex if not strict JSON
    }
  }

  const axes: VariantAxis[] = [];
  const seen = new Set<string>();

  const interfaceMatch = code.match(
    /(?:interface|type)\s+[A-Za-z0-9_$]+(?:Props)?\s*(?:=\s*)?\{([\s\S]*?)\}/,
  );
  if (interfaceMatch?.[1]) {
    const body = interfaceMatch[1];
    const lines = body.split(/[\n;]/);
    for (const line of lines) {
      const match = line.match(/^\s*([a-zA-Z0-9_$]+)\??:\s*([^\n;]+)/);
      if (match?.[1] && match[2]) {
        const propName = match[1];
        const propType = match[2];
        const stringLiterals = [...propType.matchAll(/"([^"]+)"|'([^']+)'/g)]
          .map((m) => m[1] ?? m[2])
          .filter((s): s is string => typeof s === "string");
        if (stringLiterals.length >= 2 && !seen.has(propName)) {
          seen.add(propName);
          axes.push({ name: propName, values: stringLiterals });
        }
      }
    }
  }

  const cvaMatch = code.match(/variants\s*:\s*\{([\s\S]*?)\}\s*(?:,|\})/);
  if (cvaMatch?.[1]) {
    const cvaBody = cvaMatch[1];
    const axisBlocks = [
      ...cvaBody.matchAll(/([a-zA-Z0-9_$]+)\s*:\s*\{([^}]*)\}/g),
    ];
    for (const b of axisBlocks) {
      const axisName = b[1];
      const blockBody = b[2];
      if (axisName && blockBody && !seen.has(axisName)) {
        const valKeys = [...blockBody.matchAll(/([a-zA-Z0-9_$]+)\s*:/g)]
          .map((m) => m[1])
          .filter((s): s is string => typeof s === "string");
        if (valKeys.length >= 2) {
          seen.add(axisName);
          axes.push({ name: axisName, values: valKeys });
        }
      }
    }
  }

  return axes;
}

export function scanComponents(
  files: Record<string, string>,
  manifest?: Manifest | null,
): ComponentInfo[] {
  const pageFiles = new Set(manifest?.pages.map((p) => p.file) ?? []);
  const components: ComponentInfo[] = [];

  for (const [file, code] of Object.entries(files)) {
    if (!file.endsWith(".tsx") || pageFiles.has(file)) continue;

    const isComponentDir =
      file.startsWith("components/") || file.includes("/components/");
    const hasRuntimeImport = code.includes("@ombrique/runtime");
    if (!isComponentDir && !hasRuntimeImport) continue;

    let name: string | null = null;
    const namedExport = code.match(/export\s+function\s+([A-Z][a-zA-Z0-9_$]*)/);
    if (namedExport?.[1]) {
      name = namedExport[1];
    } else {
      const constExport = code.match(/export\s+const\s+([A-Z][a-zA-Z0-9_$]*)/);
      if (constExport?.[1]) {
        name = constExport[1];
      } else {
        const defaultExport = code.match(
          /export\s+default\s+function\s+([A-Z][a-zA-Z0-9_$]*)/,
        );
        if (defaultExport?.[1]) {
          name = defaultExport[1];
        } else if (file.endsWith(".tsx")) {
          const base = file
            .split("/")
            .pop()
            ?.replace(/\.tsx$/, "");
          if (base && /^[A-Z]/.test(base)) {
            name = base;
          }
        }
      }
    }

    if (!name) continue;

    let parsedRoot: DesignElement | null = null;
    try {
      const parsed = parseDesignFile(file, code);
      parsedRoot = parsed.root;
    } catch {
      parsedRoot = null;
    }

    components.push({
      name,
      file,
      frameName: pageNameOf(parsedRoot, name),
      root: parsedRoot,
      axes: extractVariantAxes(code),
    });
  }

  return components;
}

export function buildIndex(files: Record<string, string>): DesignIndex {
  const sources = new Map<string, string>(Object.entries(files));
  const parsedFiles = new Map<string, ParsedDesignFile>();
  const stylesheetFiles = new Map<string, ParsedStylesheet>();
  const elements = new Map<string, DesignElement>();
  const byPathMap = new Map<string, DesignElement>();
  let manifest: Manifest | null = null;
  let manifestFile: string | null = null;

  for (const [file, code] of sources) {
    if (file.endsWith(".tsx")) {
      const parsed = parseDesignFile(file, code);
      parsedFiles.set(file, parsed);
      for (const el of parsed.elements) {
        elements.set(byRefKey(file, el.ref.start), el);
        byPathMap.set(byPathKey(file, el.path), el);
      }
    } else if (file.endsWith(".scss") || file.endsWith(".css")) {
      stylesheetFiles.set(file, parseStylesheet(file, code));
    } else if (file === "ombrique.json" || file.endsWith("/ombrique.json")) {
      manifest = JSON.parse(code) as Manifest;
      manifestFile = file;
    }
  }

  const byClass = new Map<string, StylesheetRule[]>();
  for (const sheet of stylesheetFiles.values()) {
    for (const rule of sheet.rules) {
      for (const cls of extractClasses(rule.fullSelector)) {
        const list = byClass.get(cls);
        if (list) list.push(rule);
        else byClass.set(cls, [rule]);
      }
    }
  }

  const pages: PageInfo[] = [];
  if (manifest) {
    for (const page of manifest.pages) {
      const parsed = parsedFiles.get(page.file);
      const root = parsed?.root ?? null;
      pages.push({
        id: page.id,
        name: page.name,
        file: page.file,
        root,
        x: numericAttr(root, "x"),
        y: numericAttr(root, "y"),
        width: numericAttr(root, "width"),
        height: numericAttr(root, "height"),
        frameName: pageNameOf(root, page.name),
      });
    }
  } else {
    for (const [file, parsed] of parsedFiles) {
      const root = parsed.root;
      pages.push({
        id: file,
        name: file,
        file,
        root,
        x: numericAttr(root, "x"),
        y: numericAttr(root, "y"),
        width: numericAttr(root, "width"),
        height: numericAttr(root, "height"),
        frameName: pageNameOf(root, file),
      });
    }
  }

  return {
    pages,
    manifest,
    manifestFile,
    byRef: (ref) => elements.get(byRefKey(ref.file, ref.start)),
    byPath: (file, path) => byPathMap.get(byPathKey(file, path)),
    elements,
    styles: {
      byClass,
      files: stylesheetFiles,
      tokens: parseTokenTable(stylesheetFiles.get("tokens.css")),
    },
    sources,
    components: scanComponents(files, manifest),
  };
}

export function locateByPath(
  index: DesignIndex,
  file: string,
  path: readonly number[],
): DesignElement | undefined {
  return index.byPath(file, path);
}
