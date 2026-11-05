export const ICON_TAG_CHARS = {
  circle: "c",
  ellipse: "e",
  rect: "r",
  line: "l",
  polygon: "g",
  polyline: "p",
  path: "d",
} as const;

export type IconTag = keyof typeof ICON_TAG_CHARS;

export type IconSetKind = "stroke" | "fill";

export interface IconNode {
  tag: IconTag;
  attrs: Record<string, string>;
}

export interface IconGeometry {
  viewBox: string;
  nodes: IconNode[];
}

export interface IconSetDefinition {
  name: string;
  kind: IconSetKind;
  viewBox: string;
  defaultStrokeWidth: number;
  icons: Record<string, string>;
  aliases: Record<string, string>;
  iconViewBoxes?: Record<string, string>;
}

export interface IconSetSource {
  icons: Record<string, IconNode[]>;
  aliases: Record<string, string>;
}

const TAG_NAMES: readonly string[] = Object.keys(ICON_TAG_CHARS);

export function isIconTag(value: string): value is IconTag {
  return TAG_NAMES.includes(value);
}

const TAG_BY_CHAR: Record<string, IconTag> = {
  c: "circle",
  d: "path",
  e: "ellipse",
  g: "polygon",
  l: "line",
  p: "polyline",
  r: "rect",
};

const ATTR_ORDER: Record<IconTag, readonly string[]> = {
  circle: ["cx", "cy", "r", "fill"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polygon: ["points"],
  polyline: ["points"],
  path: ["d", "fill"],
};

const SEPARATOR_CHARS = ";:=,".split("");

function failSeparator(value: string): never {
  throw new Error(
    `icon value contains a codec separator: ${JSON.stringify(value)}`,
  );
}

function attrPair(key: string, raw: string | undefined): string {
  if (raw === undefined) return `${key}=`;
  if (SEPARATOR_CHARS.some((char) => raw.includes(char))) {
    failSeparator(`${key}=${raw}`);
  }
  return `${key}=${raw}`;
}

export function encodeIconNodes(nodes: readonly IconNode[]): string {
  return nodes
    .map((node) => {
      const order = ATTR_ORDER[node.tag];
      const keys = [
        ...order.filter((key) => key in node.attrs),
        ...Object.keys(node.attrs)
          .filter((key) => !order.includes(key))
          .sort(),
      ];
      const attrs = keys.map((key) => attrPair(key, node.attrs[key])).join(",");
      return `${ICON_TAG_CHARS[node.tag]}:${attrs}`;
    })
    .join(";");
}

export function decodeIconNodes(encoded: string): IconNode[] {
  const nodes: IconNode[] = [];
  for (const entry of encoded.split(";")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) throw new Error(`malformed icon node: ${entry}`);
    const tag = TAG_BY_CHAR[entry.slice(0, separator)];
    if (!tag) throw new Error(`unknown icon tag: ${entry}`);
    const attrs: Record<string, string> = {};
    for (const pair of entry.slice(separator + 1).split(",")) {
      const equals = pair.indexOf("=");
      if (equals <= 0) throw new Error(`malformed icon attr: ${pair}`);
      attrs[pair.slice(0, equals)] = pair.slice(equals + 1);
    }
    nodes.push({ tag, attrs });
  }
  return nodes;
}
