import type postcss from "postcss";
import { parse as parseScss } from "postcss-scss";
import type {
  ParsedStylesheet,
  Span,
  StylesheetDecl,
  StylesheetRule,
} from "./types.js";

const CLASS_RE = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g;

function splitSelectors(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

function combineSelectors(parents: string[], child: string): string[] {
  if (parents.length === 0) return splitSelectors(child);
  const out: string[] = [];
  for (const parent of parents) {
    for (const part of splitSelectors(child)) {
      out.push(
        part.includes("&") ? part.replaceAll("&", parent) : `${parent} ${part}`,
      );
    }
  }
  return out;
}

function extractClasses(selector: string): string[] {
  const classes: string[] = [];
  for (const match of selector.matchAll(CLASS_RE)) {
    const cls = match[1];
    if (cls !== undefined) classes.push(cls);
  }
  return classes;
}

export function parseStylesheet(file: string, code: string): ParsedStylesheet {
  const root = parseScss(code);
  const rules: StylesheetRule[] = [];

  const visit = (container: postcss.Container, parents: string[]): void => {
    for (const node of container.nodes ?? []) {
      if (node.type === "comment") continue;
      if (node.type === "decl") continue;
      if (node.type !== "rule") continue;
      const rule = node as postcss.Rule;
      const expanded = combineSelectors(parents, rule.selector);
      const selectorSpan: Span = {
        start: rule.source?.start?.offset ?? 0,
        end: (rule.source?.start?.offset ?? 0) + rule.selector.length,
      };
      const decls: StylesheetDecl[] = [];
      for (const child of rule.nodes ?? []) {
        if (child.type !== "decl") continue;
        const decl = child as postcss.Declaration;
        const declStart = decl.source?.start?.offset ?? 0;
        const between = decl.raws.between ?? ":";
        const valueStart = declStart + decl.prop.length + between.length;
        let valueEnd = valueStart;
        while (
          valueEnd < code.length &&
          code[valueEnd] !== ";" &&
          code[valueEnd] !== "\n" &&
          code[valueEnd] !== "\r"
        ) {
          valueEnd++;
        }
        while (
          valueEnd > valueStart &&
          (code[valueEnd - 1] === " " || code[valueEnd - 1] === "\t")
        )
          valueEnd--;
        decls.push({
          prop: decl.prop,
          value: decl.value,
          propSpan: { start: declStart, end: valueEnd },
          valueSpan: { start: valueStart, end: valueEnd },
        });
      }
      for (const fullSelector of expanded) {
        rules.push({
          file,
          selector: rule.selector,
          selectorSpan,
          fullSelector,
          decls,
        });
      }
      visit(rule, expanded);
    }
  };
  visit(root, []);

  return { file, rules };
}

export { extractClasses };
