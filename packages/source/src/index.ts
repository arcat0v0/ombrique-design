export { applyEdits } from "./apply-edits.js";
export { buildIndex, locateByPath } from "./build-index.js";
export type { DesignIndex, PageInfo, StylesIndex } from "./build-index.js";
export { parseDesignFile } from "./parse-design-file.js";
export { parseStylesheet } from "./parse-stylesheet.js";
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
  TextChild,
  TextEdit,
} from "./types.js";
