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
  ruleSpan: Span;
  fullSelector: string;
  decls: StylesheetDecl[];
}

export interface ParsedStylesheet {
  file: string;
  rules: StylesheetRule[];
}

export interface TokenAxisSelector {
  axis: string;
  value: string;
}

export interface TokenRule {
  order: number;
  specificity: number;
  isDefault: boolean;
  selectors: TokenAxisSelector[];
  rule: StylesheetRule;
}

export interface TokenAxis {
  name: string;
  values: string[];
  isDefault?: boolean;
}

export interface TokenCell {
  value: string;
  ruleIndex: number;
  order: number;
  specificity: number;
  isDefault: boolean;
  selectors: TokenAxisSelector[];
  propSpan: Span;
  valueSpan: Span;
  file: string;
}

export interface TokenDefinition {
  name: string;
  value: string;
  values: Record<string, string>;
  cells: TokenCell[];
  axisValues: Record<string, Record<string, TokenCell[]>>;
  file: string;
  span: Span;
}

export interface TokenMode {
  name: string;
  isDefault: boolean;
  axis: string;
  rules: StylesheetRule[];
}

export interface TokenTable {
  modes: TokenMode[];
  axes: TokenAxis[];
  rules: TokenRule[];
  tokens: TokenDefinition[];
}

export interface TokenCellTarget {
  kind: "default" | "mode" | "cell";
  selectors: TokenAxisSelector[];
  mode?: TokenMode;
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
