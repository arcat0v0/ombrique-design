import type postcss from "postcss";
import { parse as parseScss } from "postcss-scss";
import type {
  ParsedStylesheet,
  Span,
  StylesheetDecl,
  StylesheetRule,
  TokenTable,
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
        const value = decl.value.trim();
        const valueEnd = valueStart + value.length;
        decls.push({
          prop: decl.prop,
          value,
          propSpan: { start: declStart, end: valueEnd },
          valueSpan: { start: valueStart, end: valueEnd },
        });
      }
      for (const fullSelector of expanded) {
        rules.push({
          file,
          selector: rule.selector,
          selectorSpan,
          ruleSpan: {
            start: rule.source?.start?.offset ?? 0,
            end: rule.source?.end?.offset ?? code.length,
          },
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

export function parseTokenTable(
  sheet: ParsedStylesheet | undefined,
): TokenTable {
  const modes: TokenTable["modes"] = [];
  const seen = new Set<number>();
  for (const rule of sheet?.rules ?? []) {
    if (!splitSelectors(rule.selector).includes(rule.fullSelector)) continue;
    if (seen.has(rule.selectorSpan.start)) continue;
    seen.add(rule.selectorSpan.start);
    const selectors = splitSelectors(rule.selector);
    const isDefault = selectors.includes(":root");
    const names = selectors.flatMap((selector) => {
      const match =
        /^\[data-mode\s*=\s*(?:"([^"\\]+)"|'([^'\\]+)'|([\w-]+))\s*\]$/.exec(
          selector,
        );
      const name = match?.[1] ?? match?.[2] ?? match?.[3];
      return name ? [name] : [];
    });
    if (!isDefault && (names.length !== selectors.length || names.length !== 1))
      continue;
    const name = names[0] ?? "default";
    const existing = modes.find((mode) => mode.name === name);
    if (existing) {
      existing.isDefault ||= isDefault;
      existing.rules.push(rule);
    } else modes.push({ name, isDefault, rules: [rule] });
  }
  if (!modes.some((mode) => mode.isDefault))
    modes.unshift({ name: "default", isDefault: true, rules: [] });
  modes.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const tokens = new Map<string, TokenTable["tokens"][number]>();
  for (const mode of modes) {
    for (const rule of mode.rules) {
      for (const decl of rule.decls) {
        if (!decl.prop.startsWith("--")) continue;
        let token = tokens.get(decl.prop);
        if (!token) {
          token = {
            name: decl.prop,
            value: "",
            values: Object.create(null) as Record<string, string>,
            file: rule.file,
            span: decl.propSpan,
          };
          tokens.set(decl.prop, token);
        }
        token.values[mode.name] = decl.value;
        if (mode.isDefault) {
          token.value = decl.value;
          token.span = decl.propSpan;
        }
      }
    }
  }
  return { modes, tokens: [...tokens.values()] };
}

export { extractClasses };
