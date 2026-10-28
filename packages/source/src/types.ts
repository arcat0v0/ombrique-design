import type { NodeRef } from "../../protocol/src/index.js";

export interface Span {
  start: number;
  end: number;
}

export type ElementKind = "intrinsic" | "runtime" | "component";

export interface StyleProp {
  key: string;
  value: string | number | null;
  dynamic: boolean;
  keySpan: Span;
  valueSpan: Span | null;
  propSpan: Span;
}

export type AttrKind = "string" | "number" | "boolean" | "expression";

export interface AttrValue {
  kind: AttrKind;
  value: string | number | boolean | null;
  valueSpan: Span;
  attrSpan: Span;
}

export interface ClassNameInfo {
  text: string;
  staticValue: string | null;
  span: Span;
}

export interface TextChild {
  value: string;
  span: Span;
}

export interface DesignElement {
  ref: NodeRef;
  path: number[];
  tag: string;
  kind: ElementKind;
  generated: boolean;
  attrs: Record<string, AttrValue>;
  dataAttrs: Record<string, string>;
  className: ClassNameInfo | null;
  style: StyleProp[];
  styleObjectSpan: Span | null;
  styleAttrSpan: Span | null;
  texts: TextChild[];
  textSpan: Span | null;
  children: DesignElement[];
  parent: DesignElement | null;
  openingSpan: Span;
  closingSpan: Span | null;
  selfClosing: boolean;
}

export interface ParsedDesignFile {
  file: string;
  root: DesignElement | null;
  elements: DesignElement[];
  runtimeImports: string[];
}

export interface StylesheetDecl {
  prop: string;
  value: string;
  propSpan: Span;
  valueSpan: Span;
}

export interface StylesheetRule {
  file: string;
  selector: string;
  selectorSpan: Span;
  fullSelector: string;
  decls: StylesheetDecl[];
}

export interface ParsedStylesheet {
  file: string;
  rules: StylesheetRule[];
}

export interface TextEdit {
  file: string;
  start: number;
  end: number;
  text: string;
}

export interface PlanResult {
  edits: TextEdit[];
  changedFiles: string[];
  meta: { deletedPageFile?: string };
}
