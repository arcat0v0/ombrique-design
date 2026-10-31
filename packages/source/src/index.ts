export { applyEdits } from "./apply-edits.js";
export {
  buildIndex,
  extractVariantAxes,
  locateByPath,
  scanComponents,
} from "./build-index.js";
export type {
  ComponentInfo,
  DesignIndex,
  PageInfo,
  StylesIndex,
} from "./build-index.js";
export { parseDesignFile } from "./parse-design-file.js";
export { parseStylesheet, parseTokenTable } from "./parse-stylesheet.js";
export { planPatch } from "./plan-patch.js";
export type {
  AttrValue,
  AttrKind,
  ClassNameInfo,
  DesignElement,
  ElementKind,
  ParsedDesignFile,
  ParsedStylesheet,
  PlanResult,
  Span,
  StyleProp,
  StylesheetDecl,
  StylesheetRule,
  TokenDefinition,
  TokenMode,
  TokenTable,
  TextChild,
  TextEdit,
} from "./types.js";
