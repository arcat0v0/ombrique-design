import type { Manifest } from "../../protocol/src/index.js";
import { parseDesignFile } from "./parse-design-file.js";
import { extractClasses, parseStylesheet } from "./parse-stylesheet.js";
import type {
  DesignElement,
  ParsedDesignFile,
  ParsedStylesheet,
  StylesheetRule,
} from "./types.js";

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
    } else if (file.endsWith(".scss")) {
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
    styles: { byClass, files: stylesheetFiles },
    sources,
  };
}

export function locateByPath(
  index: DesignIndex,
  file: string,
  path: readonly number[],
): DesignElement | undefined {
  return index.byPath(file, path);
}
