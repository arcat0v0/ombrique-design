import type postcss from "postcss";
import { parse as parseScss } from "postcss-scss";
import type {
  ParsedStylesheet,
  Span,
  StylesheetDecl,
  StylesheetRule,
  TokenAxis,
  TokenAxisSelector,
  TokenCell,
  TokenCellTarget,
  TokenDefinition,
  TokenMode,
  TokenRule,
  TokenTable,
} from "./types.js";

export const DEFAULT_TOKEN_AXIS = ":root";
export const DEFAULT_TOKEN_VALUE = "default";
export const TOKEN_CELL_PREFIX = "ombrique";

const AXIS_SELECTOR_SOURCE = String.raw`\[data-([\w-]+)\s*=\s*(?:"([^"\\]+)"|'([^'\\]+)'|([^\]\s]+))\s*\]`;

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

function parseAxisSelectors(
  selector: string,
): { selectors: TokenAxisSelector[]; isDefault: boolean } | null {
  let rest = selector.trim();
  const isDefault = rest.includes(":root");
  rest = rest.replaceAll(":root", "").trim();
  const selectors: TokenAxisSelector[] = [];
  for (const match of rest.matchAll(new RegExp(AXIS_SELECTOR_SOURCE, "g"))) {
    const axis = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    if (axis === undefined || value === undefined) continue;
    selectors.push({ axis, value });
  }
  const stripped = rest
    .replace(new RegExp(AXIS_SELECTOR_SOURCE, "g"), "")
    .trim();
  if (stripped.length > 0) return null;
  if (!isDefault && selectors.length === 0) return null;
  return { selectors, isDefault };
}

export function selectorKey(selectors: TokenAxisSelector[]): string {
  return selectors
    .map((selector) => `${selector.axis}\u0000${selector.value}`)
    .sort()
    .join("\u0001");
}

function buildAxes(rules: TokenRule[]): TokenAxis[] {
  const defaultAxis: TokenAxis = {
    name: DEFAULT_TOKEN_AXIS,
    values: [DEFAULT_TOKEN_VALUE],
    isDefault: true,
  };
  const axes = [defaultAxis];
  const byName = new Map<string, TokenAxis>([
    [DEFAULT_TOKEN_AXIS, defaultAxis],
  ]);
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      let axis = byName.get(selector.axis);
      if (!axis) {
        axis = { name: selector.axis, values: [] };
        byName.set(selector.axis, axis);
        axes.push(axis);
      }
      if (!axis.values.includes(selector.value))
        axis.values.push(selector.value);
    }
  }
  return axes;
}

function ensureMode(
  name: string,
  isDefault: boolean,
  byName: Map<string, TokenMode>,
): TokenMode {
  let mode = byName.get(name);
  if (!mode) {
    mode = {
      name,
      isDefault,
      axis: name === "default" ? DEFAULT_TOKEN_AXIS : "mode",
      rules: [],
    };
    byName.set(name, mode);
  } else if (isDefault) {
    mode.isDefault = true;
  }
  return mode;
}

function pushRule(mode: TokenMode, rule: StylesheetRule): void {
  if (!mode.rules.includes(rule)) mode.rules.push(rule);
}

function buildModes(rules: TokenRule[]): TokenMode[] {
  const byName = new Map<string, TokenMode>();
  const groups = new Map<number, TokenRule[]>();
  for (const rule of rules) {
    const start = rule.rule.selectorSpan.start;
    const group = groups.get(start) ?? [];
    group.push(rule);
    groups.set(start, group);
  }
  for (const group of groups.values()) {
    const modeValues = new Set<string>();
    const defaultRules: TokenRule[] = [];
    for (const rule of group) {
      for (const selector of rule.selectors) {
        if (selector.axis === "mode") modeValues.add(selector.value);
      }
      if (rule.selectors.length === 0 && rule.isDefault)
        defaultRules.push(rule);
    }
    if (modeValues.size === 0) {
      const mode = ensureMode("default", true, byName);
      for (const rule of defaultRules) pushRule(mode, rule.rule);
      continue;
    }
    for (const name of modeValues) {
      const mode = ensureMode(name, defaultRules.length > 0, byName);
      for (const rule of defaultRules) pushRule(mode, rule.rule);
      for (const rule of group) {
        if (
          rule.selectors.some(
            (selector) => selector.axis === "mode" && selector.value === name,
          )
        ) {
          if (rule.isDefault) mode.isDefault = true;
          pushRule(mode, rule.rule);
        }
      }
    }
  }
  const modes = [...byName.values()];
  modes.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  if (!modes.some((mode) => mode.isDefault)) {
    modes.unshift({
      name: "default",
      isDefault: true,
      axis: DEFAULT_TOKEN_AXIS,
      rules: [],
    });
  }
  return modes;
}

function addAxisValue(
  token: TokenDefinition,
  axis: string,
  value: string,
  cell: TokenCell,
): void {
  let byValue = token.axisValues[axis];
  if (!byValue) {
    byValue = Object.create(null) as Record<string, TokenCell[]>;
    token.axisValues[axis] = byValue;
  }
  const cells = byValue[value] ?? [];
  cells.push(cell);
  byValue[value] = cells;
}

function buildTokens(
  rules: TokenRule[],
  modes: TokenMode[],
): TokenDefinition[] {
  const byMode = new Map<string, Record<string, string>>();
  for (const mode of modes) {
    const values = Object.create(null) as Record<string, string>;
    for (const rule of mode.rules) {
      for (const decl of rule.decls) {
        if (decl.prop.startsWith("--")) values[decl.prop] = decl.value;
      }
    }
    byMode.set(mode.name, values);
  }
  const tokens = new Map<string, TokenDefinition>();
  for (const rule of rules) {
    for (const decl of rule.rule.decls) {
      if (!decl.prop.startsWith("--")) continue;
      let token = tokens.get(decl.prop);
      if (!token) {
        token = {
          name: decl.prop,
          value: "",
          values: Object.create(null) as Record<string, string>,
          cells: [],
          axisValues: Object.create(null) as Record<
            string,
            Record<string, TokenCell[]>
          >,
          file: rule.rule.file,
          span: decl.propSpan,
        };
        tokens.set(decl.prop, token);
      }
      const cell: TokenCell = {
        value: decl.value,
        ruleIndex: rule.order,
        order: rule.order,
        specificity: rule.specificity,
        isDefault: rule.isDefault,
        selectors: rule.selectors,
        propSpan: decl.propSpan,
        valueSpan: decl.valueSpan,
        file: rule.rule.file,
      };
      token.cells.push(cell);
      if (rule.selectors.length === 0) {
        addAxisValue(token, DEFAULT_TOKEN_AXIS, DEFAULT_TOKEN_VALUE, cell);
      }
      for (const selector of rule.selectors) {
        addAxisValue(token, selector.axis, selector.value, cell);
      }
    }
  }
  const defaultMode = modes.find((mode) => mode.isDefault);
  const defaultValues = defaultMode ? byMode.get(defaultMode.name) : undefined;
  for (const token of tokens.values()) {
    const values = Object.create(null) as Record<string, string>;
    for (const [modeName, map] of byMode) {
      const value = map[token.name];
      if (value !== undefined) values[modeName] = value;
    }
    token.values = values;
    const defaultValue = defaultValues?.[token.name];
    if (defaultValue !== undefined) {
      token.value = defaultValue;
      const defaultCell = [...token.cells]
        .reverse()
        .find((cell) => cell.isDefault);
      if (defaultCell) token.span = defaultCell.propSpan;
    }
  }
  return [...tokens.values()];
}

export function parseTokenTable(
  sheet: ParsedStylesheet | undefined,
): TokenTable {
  const rules: TokenRule[] = [];
  const seen = new Set<string>();
  for (const rule of sheet?.rules ?? []) {
    const parsed = parseAxisSelectors(rule.fullSelector);
    if (!parsed) continue;
    const key = `${rule.selectorSpan.start}:${rule.fullSelector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({
      order: rules.length,
      specificity: parsed.selectors.length + (parsed.isDefault ? 1 : 0),
      isDefault: parsed.isDefault,
      selectors: parsed.selectors,
      rule,
    });
  }
  const axes = buildAxes(rules);
  const modes = buildModes(rules);
  const tokens = buildTokens(rules, modes);
  return { modes, axes, rules, tokens };
}

function ruleMatches(
  rule: TokenRule,
  activeAxes: Record<string, string>,
): boolean {
  if (rule.selectors.length === 0) return true;
  return rule.selectors.every(
    (selector) => activeAxes[selector.axis] === selector.value,
  );
}

export function resolveTokenValue(
  table: TokenTable,
  name: string,
  activeAxes: Record<string, string> = {},
): string | undefined {
  const prop = name.startsWith("--") ? name : `--${name}`;
  let best: { specificity: number; order: number; value: string } | undefined;
  for (const rule of table.rules) {
    if (!ruleMatches(rule, activeAxes)) continue;
    const decl = [...rule.rule.decls]
      .reverse()
      .find((item) => item.prop === prop);
    if (!decl) continue;
    if (
      !best ||
      rule.specificity > best.specificity ||
      (rule.specificity === best.specificity && rule.order > best.order)
    ) {
      best = {
        specificity: rule.specificity,
        order: rule.order,
        value: decl.value,
      };
    }
  }
  return best?.value;
}

function decodePart(part: string): string {
  let out = "";
  let index = 0;
  while (index < part.length) {
    if (part[index] === "-") {
      const end = part.indexOf("-", index + 1);
      if (end === -1) throw new Error(`Invalid token cell: ${part}`);
      const code = Number.parseInt(part.slice(index + 1, end), 16);
      out += String.fromCodePoint(code);
      index = end + 1;
    } else {
      out += part[index] ?? "";
      index += 1;
    }
  }
  return out;
}

export function decodeTokenCellRef(
  modeName: string | undefined,
  table: TokenTable,
): TokenCellTarget {
  if (modeName === undefined) return { kind: "default", selectors: [] };
  const mode = table.modes.find((item) => item.name === modeName);
  if (mode) {
    if (mode.isDefault) return { kind: "default", selectors: [], mode };
    return {
      kind: "mode",
      mode,
      selectors: [{ axis: "mode", value: modeName }],
    };
  }
  const parts = modeName.split(" ");
  if (parts[0] !== TOKEN_CELL_PREFIX)
    throw new Error(`Unknown token mode: ${modeName}`);
  const rest = parts.slice(1);
  if (rest.length === 1 && rest[0] === "root")
    return { kind: "default", selectors: [] };
  const selectors: TokenAxisSelector[] = [];
  for (const group of rest) {
    const split = group.split("---");
    const axisPart = split[0];
    const valuePart = split[1];
    if (axisPart === undefined || valuePart === undefined || split.length !== 2)
      throw new Error(`Unknown token cell: ${modeName}`);
    selectors.push({
      axis: decodePart(axisPart),
      value: decodePart(valuePart),
    });
  }
  return { kind: "cell", selectors };
}

export { extractClasses };
