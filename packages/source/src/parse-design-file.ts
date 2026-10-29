import { parseSync } from "oxc-parser";
import type {
  JSXAttribute,
  JSXElement,
  JSXExpression,
  JSXExpressionContainer,
  Node,
  ObjectExpression,
} from "oxc-parser";
import type {
  AttrValue,
  DesignElement,
  ElementKind,
  ParsedDesignFile,
  Span,
  TextChild,
} from "./types.js";

type AnyNode = Record<string, unknown> & { type?: string };

const isNode = (value: unknown): value is AnyNode =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string";

function isType<T>(node: unknown, type: string): node is T {
  return isNode(node) && node.type === type;
}

function childArray(node: AnyNode): unknown[] {
  if (!("children" in node)) return [];
  const children = node.children;
  return Array.isArray(children) ? children : [];
}

function eachChildValue(node: AnyNode, visit: (child: unknown) => void): void {
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    visit(node[key]);
  }
}

function attrName(attr: JSXAttribute): string {
  const name = attr.name;
  if (name.type === "JSXIdentifier") return name.name;
  return `${name.namespace.name}:${name.name.name}`;
}

function literalValue(
  expr: JSXExpression | Node | null | undefined,
): { value: string | number | boolean; span: Span } | null {
  if (!expr || typeof expr !== "object") return null;
  if (expr.type === "Literal") {
    const value = expr.value;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return { value, span: { start: expr.start, end: expr.end } };
    }
    return null;
  }
  if (expr.type === "UnaryExpression") {
    const { operator, argument } = expr;
    if (
      (operator === "-" || operator === "+") &&
      argument.type === "Literal" &&
      typeof argument.value === "number"
    ) {
      const value = operator === "-" ? -argument.value : argument.value;
      return { value, span: { start: expr.start, end: expr.end } };
    }
  }
  return null;
}

function evalStyleValue(expr: Node | null | undefined): {
  value: string | number | null;
  dynamic: boolean;
  valueSpan: Span | null;
} {
  const lit = literalValue(expr);
  if (lit && (typeof lit.value === "string" || typeof lit.value === "number")) {
    return { value: lit.value, dynamic: false, valueSpan: lit.span };
  }
  if (expr && typeof expr === "object" && "start" in expr && "end" in expr) {
    const start = expr.start;
    const end = expr.end;
    if (typeof start === "number" && typeof end === "number") {
      return { value: null, dynamic: true, valueSpan: { start, end } };
    }
  }
  return { value: null, dynamic: true, valueSpan: null };
}

function collectTopmostJsx(expr: unknown, out: JSXElement[]): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isNode(node)) return;
    if (isType<JSXElement>(node, "JSXElement")) {
      out.push(node);
      return;
    }
    if (node.type === "JSXFragment") {
      for (const child of childArray(node)) walk(child);
      return;
    }
    eachChildValue(node, walk);
  };
  walk(expr);
}

interface SourceContext {
  file: string;
  code: string;
  runtimeImports: Set<string>;
}

function tagNameOf(element: JSXElement): string {
  const name = element.openingElement.name;
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") {
    const parts: string[] = [];
    let obj = name.object;
    while (obj.type === "JSXMemberExpression") {
      parts.unshift(obj.property.name);
      obj = obj.object;
    }
    parts.unshift(obj.name);
    parts.push(name.property.name);
    return parts.join(".");
  }
  return `${name.namespace.name}:${name.name.name}`;
}

function kindOf(tagName: string, runtimeImports: Set<string>): ElementKind {
  if (/^[a-z]/.test(tagName)) return "intrinsic";
  if (runtimeImports.has(tagName)) return "runtime";
  return "component";
}

function readAttrValue(attr: JSXAttribute): AttrValue {
  const attrSpan: Span = { start: attr.start, end: attr.end };
  const nameSpan: Span = { start: attr.name.start, end: attr.name.end };
  if (attr.value === null) {
    return { kind: "boolean", value: true, valueSpan: nameSpan, attrSpan };
  }
  if (attr.value.type === "Literal") {
    const raw = attr.value.value;
    if (typeof raw === "number") {
      return {
        kind: "number",
        value: raw,
        valueSpan: { start: attr.value.start, end: attr.value.end },
        attrSpan,
      };
    }
    if (typeof raw === "string") {
      return {
        kind: "string",
        value: raw,
        valueSpan: { start: attr.value.start, end: attr.value.end },
        attrSpan,
      };
    }
    return {
      kind: "expression",
      value: null,
      valueSpan: { start: attr.value.start, end: attr.value.end },
      attrSpan,
    };
  }
  if (attr.value.type === "JSXElement" || attr.value.type === "JSXFragment") {
    return {
      kind: "expression",
      value: null,
      valueSpan: { start: attr.value.start, end: attr.value.end },
      attrSpan,
    };
  }
  const container: JSXExpressionContainer = attr.value;
  const lit = literalValue(container.expression);
  if (lit) {
    const kind: AttrValue["kind"] =
      typeof lit.value === "string"
        ? "string"
        : typeof lit.value === "number"
          ? "number"
          : "boolean";
    return { kind, value: lit.value, valueSpan: lit.span, attrSpan };
  }
  return {
    kind: "expression",
    value: null,
    valueSpan: {
      start: container.expression.start,
      end: container.expression.end,
    },
    attrSpan,
  };
}

function readStyleObject(
  element: DesignElement,
  container: JSXExpressionContainer,
): void {
  if (!isType<ObjectExpression>(container.expression, "ObjectExpression"))
    return;
  const obj = container.expression;
  element.styleObjectSpan = { start: obj.start, end: obj.end };
  for (const prop of obj.properties) {
    if (prop.type !== "Property") continue;
    const keyName =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "Literal"
          ? String(prop.key.value)
          : null;
    if (keyName === null) continue;
    const evaluated = evalStyleValue(prop.value);
    element.style.push({
      key: keyName,
      value: evaluated.value,
      dynamic: evaluated.dynamic,
      keySpan: { start: prop.key.start, end: prop.key.end },
      valueSpan: evaluated.valueSpan,
      propSpan: { start: prop.start, end: prop.end },
    });
  }
}

function buildElement(
  ctx: SourceContext,
  jsx: JSXElement,
  path: number[],
  parent: DesignElement | null,
  generated: boolean,
): DesignElement {
  const opening = jsx.openingElement;
  const tagName = tagNameOf(jsx);
  const element: DesignElement = {
    ref: { file: ctx.file, start: jsx.start, end: jsx.end },
    path,
    tag: tagName,
    kind: kindOf(tagName, ctx.runtimeImports),
    generated,
    attrs: {},
    dataAttrs: {},
    className: null,
    style: [],
    styleObjectSpan: null,
    styleAttrSpan: null,
    texts: [],
    textSpan: null,
    children: [],
    parent,
    openingSpan: { start: opening.start, end: opening.end },
    closingSpan: jsx.closingElement
      ? { start: jsx.closingElement.start, end: jsx.closingElement.end }
      : null,
    selfClosing: opening.selfClosing,
  };

  for (const item of opening.attributes) {
    if (item.type !== "JSXAttribute") continue;
    const attr: JSXAttribute = item;
    const name = attrName(attr);
    const attrValue = readAttrValue(attr);
    element.attrs[name] = attrValue;
    if (name.startsWith("data-") && typeof attrValue.value === "string") {
      element.dataAttrs[name] = attrValue.value;
    }
    if (name === "style") {
      element.styleAttrSpan = attrValue.attrSpan;
      if (attr.value !== null && attr.value.type === "JSXExpressionContainer") {
        readStyleObject(element, attr.value);
      }
    }
  }

  if (element.attrs.className) {
    const cn = element.attrs.className;
    element.className = {
      text: ctx.code.slice(cn.valueSpan.start, cn.valueSpan.end),
      staticValue:
        cn.kind === "string" && typeof cn.value === "string" ? cn.value : null,
      span: cn.valueSpan,
    };
  }

  const texts: TextChild[] = [];
  const childElements: { jsx: JSXElement; fromExpression: boolean }[] = [];
  for (const child of jsx.children) {
    if (child.type === "JSXText") {
      texts.push({
        value: child.value,
        span: { start: child.start, end: child.end },
      });
    } else if (child.type === "JSXElement") {
      childElements.push({ jsx: child, fromExpression: false });
    } else if (child.type === "JSXExpressionContainer") {
      const found: JSXElement[] = [];
      collectTopmostJsx(child.expression, found);
      for (const jsxEl of found)
        childElements.push({ jsx: jsxEl, fromExpression: true });
    }
  }
  element.texts = texts;
  element.textSpan = texts.length === 1 && texts[0] ? texts[0].span : null;
  childElements.forEach((child, index) => {
    const childEl = buildElement(
      ctx,
      child.jsx,
      [...path, index],
      element,
      generated || child.fromExpression,
    );
    element.children.push(childEl);
  });
  return element;
}

function collectTopLevelElements(program: unknown, out: JSXElement[]): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isNode(node)) return;
    if (isType<JSXElement>(node, "JSXElement")) {
      out.push(node);
      return;
    }
    if (node.type === "JSXFragment") {
      for (const child of childArray(node)) collectTopmostJsx(child, out);
      return;
    }
    eachChildValue(node, walk);
  };
  walk(program);
}

export function parseDesignFile(file: string, code: string): ParsedDesignFile {
  const result = parseSync(file, code, { lang: "tsx", sourceType: "module" });
  const runtimeImports = new Set<string>();
  for (const imp of result.module.staticImports) {
    if (imp.moduleRequest.value !== "@ombrique/runtime") continue;
    for (const entry of imp.entries) {
      if (entry.importName.kind === "Name" && entry.importName.name)
        runtimeImports.add(entry.importName.name);
    }
  }
  const ctx: SourceContext = { file, code, runtimeImports };
  const topLevel: JSXElement[] = [];
  collectTopLevelElements(result.program, topLevel);
  const elements: DesignElement[] = [];
  let root: DesignElement | null = null;
  topLevel.forEach((jsx, index) => {
    const el = buildElement(ctx, jsx, [index], null, false);
    if (index === 0) root = el;
    const stack = [el];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      elements.push(current);
      for (let i = current.children.length - 1; i >= 0; i--) {
        const childEl = current.children[i];
        if (childEl) stack.push(childEl);
      }
    }
  });
  return { file, root, elements, runtimeImports: [...runtimeImports] };
}
