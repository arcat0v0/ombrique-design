import type { CSSProperties } from "react";

export function joinClass(
  ...parts: Array<string | undefined | false>
): string | undefined {
  const joined = parts.filter(Boolean).join(" ");
  return joined === "" ? undefined : joined;
}

export function absoluteAt(x?: number, y?: number): CSSProperties {
  const style: CSSProperties = {};
  if (x !== undefined) {
    style.position = "absolute";
    style.left = x;
  }
  if (y !== undefined) {
    style.position = "absolute";
    style.top = y;
  }
  return style;
}

export function dataNameAttr(
  name: string | undefined,
  rest: object,
): { "data-name"?: string } {
  if (name !== undefined) return { "data-name": name };
  const fromRest = (rest as Record<string, unknown>)["data-name"];
  return typeof fromRest === "string" ? { "data-name": fromRest } : {};
}
