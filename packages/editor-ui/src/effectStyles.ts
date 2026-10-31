export type StrokeShadowAlignment = "inside" | "outside";

export interface ShadowValues {
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
  inset: boolean;
}

export interface BlurValues {
  radius: string;
  hidden: boolean;
}

const NUMBER_PATTERN = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const PX_LENGTH_PATTERN = new RegExp(`^(${NUMBER_PATTERN})(px)?$`, "i");

function splitCss(
  value: string | undefined,
  separator: "comma" | "whitespace",
): string[] {
  if (!value) return [];
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const matchesSeparator =
      separator === "comma" ? char === "," : /\s/.test(char);
    if (depth !== 0 || !matchesSeparator) continue;
    const part = value.slice(start, index).trim();
    if (part) parts.push(part);
    if (separator === "whitespace") {
      while (index + 1 < value.length && /\s/.test(value[index + 1] ?? "")) {
        index += 1;
      }
    }
    start = index + 1;
  }

  const finalPart = value.slice(start).trim();
  if (finalPart) parts.push(finalPart);
  return parts;
}

function parsePxLength(value: string): number | null {
  const match = PX_LENGTH_PATTERN.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  if (!match[2] && number !== 0) return null;
  return number;
}

function toCssPxLength(value: string): string {
  const trimmed = value.trim();
  const match = PX_LENGTH_PATTERN.exec(trimmed);
  if (!match) return trimmed;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return trimmed;
  return `${number}px`;
}

export function splitCssList(value: string | undefined): string[] {
  return splitCss(value, "comma");
}

export function splitFilterFunctions(value: string | undefined): string[] {
  return splitCss(value, "whitespace");
}

export function parseShadow(value: string): ShadowValues | null {
  const tokens = splitCss(value, "whitespace");
  const lengths: string[] = [];
  const color: string[] = [];
  let inset = false;

  for (const token of tokens) {
    if (token.toLowerCase() === "inset" && !inset) {
      inset = true;
    } else if (parsePxLength(token) !== null && lengths.length < 4) {
      lengths.push(token);
    } else {
      color.push(token);
    }
  }

  if (lengths.length < 2 || color.length > 1) return null;
  return {
    x: lengths[0] ?? "0px",
    y: lengths[1] ?? "0px",
    blur: lengths[2] ?? "0px",
    spread: lengths[3] ?? "0px",
    color: color[0] ?? "currentColor",
    inset,
  };
}

export function serializeShadow(values: ShadowValues): string {
  return [
    values.inset ? "inset" : "",
    toCssPxLength(values.x),
    toCssPxLength(values.y),
    toCssPxLength(values.blur),
    toCssPxLength(values.spread),
    values.color.trim() || "currentColor",
  ]
    .filter(Boolean)
    .join(" ");
}

function strokeAlignment(value: string): StrokeShadowAlignment | null {
  const shadow = parseShadow(value);
  if (!shadow) return null;
  const x = parsePxLength(shadow.x);
  const y = parsePxLength(shadow.y);
  const blur = parsePxLength(shadow.blur);
  const spread = parsePxLength(shadow.spread);
  if (x !== 0 || y !== 0 || blur !== 0 || spread === null || spread === 0) {
    return null;
  }
  return shadow.inset ? "inside" : "outside";
}

export function isStrokeShadow(value: string): boolean {
  return strokeAlignment(value) !== null;
}

function hiddenShadowColor(color: string): string | null {
  const match = /^color-mix\(([\s\S]*)\)$/i.exec(color.trim());
  if (!match) return null;
  const parts = splitCssList(match[1]);
  if (parts.length !== 3) return null;
  const interpolation = parts[0] ?? "";
  const colorAndWeight = parts[1] ?? "";
  const destination = parts[2] ?? "";
  if (!/^in\s+srgb$/i.test(interpolation)) return null;
  if (destination.toLowerCase() !== "transparent") return null;
  const original = /^([\s\S]*?)\s+0(?:\.0+)?%$/.exec(colorAndWeight);
  if (!original) return null;
  return (original[1] ?? "").trim() || null;
}

export function isShadowHidden(color: string): boolean {
  return hiddenShadowColor(color) !== null;
}

export function setShadowColorVisible(color: string, visible: boolean): string {
  const hiddenColor = hiddenShadowColor(color);
  const original = hiddenColor ?? (color.trim() || "currentColor");
  return visible ? original : `color-mix(in srgb, ${original} 0%, transparent)`;
}

export function parseBlur(value: string): BlurValues | null {
  const match = /^blur\(([\s\S]*)\)$/i.exec(value.trim());
  if (!match) return null;
  const argument = (match[1] ?? "").trim();
  const hidden = new RegExp(
    `^calc\\(\\s*(${NUMBER_PATTERN})px\\s*\\*\\s*0(?:\\.0+)?\\s*\\)$`,
    "i",
  ).exec(argument);
  if (hidden) {
    return { radius: `${Number(hidden[1])}px`, hidden: true };
  }
  if (parsePxLength(argument) === null) return null;
  return { radius: toCssPxLength(argument), hidden: false };
}

export function serializeBlur(values: BlurValues): string {
  const radius = toCssPxLength(values.radius || "0px");
  return values.hidden ? `blur(calc(${radius} * 0))` : `blur(${radius})`;
}

export function upsertStrokeShadow(
  value: string | undefined,
  alignment: StrokeShadowAlignment,
  width: string,
  color: string,
): string {
  const remaining = removeStrokeShadows(value);
  const shadows = splitCssList(remaining ?? undefined).filter(
    (shadow) => shadow.toLowerCase() !== "none",
  );
  const inset = alignment === "inside" ? "inset " : "";
  const spread = toCssPxLength(width || "0px");
  shadows.push(
    `${inset}0px 0px 0px ${spread} ${color.trim() || "currentColor"}`,
  );
  return shadows.join(", ");
}

export function removeStrokeShadows(value: string | undefined): string | null {
  const shadows = splitCssList(value).filter(
    (shadow) => !isStrokeShadow(shadow),
  );
  return shadows.length > 0 ? shadows.join(", ") : null;
}

export function getStrokeShadowAlignment(
  value: string | undefined,
): StrokeShadowAlignment | null {
  for (const shadow of splitCssList(value)) {
    const alignment = strokeAlignment(shadow);
    if (alignment) return alignment;
  }
  return null;
}
