import { splitCssList } from "./effectStyles";

export interface GradientStop {
  id: string;
  color: string;
  position: number; // 0 to 100
}

export type GradientType = "linear" | "radial";

export interface GradientData {
  type: GradientType;
  angle: number; // in degrees (0 - 360)
  stops: GradientStop[];
}

const SIDE_OR_CORNER_TO_DEG: Record<string, number> = {
  "to top": 0,
  "to top right": 45,
  "to right top": 45,
  "to right": 90,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom": 180,
  "to bottom left": 225,
  "to left bottom": 225,
  "to left": 270,
  "to top left": 315,
  "to left top": 315,
};

let stopIdCounter = 0;
function uniqueStopId(): string {
  stopIdCounter += 1;
  return `stop-${Date.now()}-${stopIdCounter}`;
}

export function isGradient(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("linear-gradient(") ||
    trimmed.startsWith("radial-gradient(")
  );
}

export function parseColorStop(rawStop: string): {
  color: string;
  position: number | null;
} {
  const trimmed = rawStop.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace > 0) {
    const possiblePos = trimmed.slice(lastSpace + 1).trim();
    if (possiblePos.endsWith("%")) {
      const num = Number.parseFloat(possiblePos.slice(0, -1));
      if (Number.isFinite(num)) {
        return {
          color: trimmed.slice(0, lastSpace).trim(),
          position: Math.max(0, Math.min(100, num)),
        };
      }
    }
  }
  return { color: trimmed, position: null };
}

export function parseGradient(raw: string): GradientData | null {
  const trimmed = raw.trim();
  const isLinear = trimmed.toLowerCase().startsWith("linear-gradient(");
  const isRadial = trimmed.toLowerCase().startsWith("radial-gradient(");

  if (!isLinear && !isRadial) return null;

  const inner = trimmed.slice(
    trimmed.indexOf("(") + 1,
    trimmed.lastIndexOf(")"),
  );
  const parts = splitCssList(inner);
  if (parts.length === 0) return null;

  let angle = 90;
  let stopParts = parts;

  if (isLinear) {
    const first = parts[0]?.trim() ?? "";
    const lowerFirst = first.toLowerCase();
    if (lowerFirst.endsWith("deg")) {
      const num = Number.parseFloat(lowerFirst.slice(0, -3));
      if (Number.isFinite(num)) {
        angle = ((num % 360) + 360) % 360;
        stopParts = parts.slice(1);
      }
    } else if (SIDE_OR_CORNER_TO_DEG[lowerFirst] !== undefined) {
      angle = SIDE_OR_CORNER_TO_DEG[lowerFirst];
      stopParts = parts.slice(1);
    } else if (lowerFirst.startsWith("to ")) {
      stopParts = parts.slice(1);
    }
  } else if (isRadial) {
    const first = parts[0]?.trim().toLowerCase() ?? "";
    if (
      first === "circle" ||
      first === "ellipse" ||
      first.startsWith("circle ") ||
      first.startsWith("ellipse ") ||
      first.startsWith("at ")
    ) {
      stopParts = parts.slice(1);
    }
  }

  if (stopParts.length === 0) return null;

  const parsedStops = stopParts.map((part) => parseColorStop(part));

  // Fill in missing positions evenly
  const count = parsedStops.length;
  const stops: GradientStop[] = parsedStops.map((s, idx) => {
    let pos = s.position;
    if (pos === null) {
      if (count === 1) pos = 0;
      else pos = (idx / (count - 1)) * 100;
    }
    return {
      id: uniqueStopId(),
      color: s.color || "#000000",
      position: Math.round(pos * 10) / 10,
    };
  });

  return {
    type: isLinear ? "linear" : "radial",
    angle,
    stops,
  };
}

export function serializeGradient(data: GradientData): string {
  const sortedStops = [...data.stops].sort((a, b) => a.position - b.position);
  const stopsStr = sortedStops
    .map((s) => `${s.color} ${Math.round(s.position)}%`)
    .join(", ");

  if (data.type === "radial") {
    return `radial-gradient(circle, ${stopsStr})`;
  }

  return `linear-gradient(${Math.round(data.angle)}deg, ${stopsStr})`;
}

export function defaultGradient(
  baseColor = "#3b82f6",
  type: GradientType = "linear",
): GradientData {
  return {
    type,
    angle: 90,
    stops: [
      { id: uniqueStopId(), color: baseColor, position: 0 },
      { id: uniqueStopId(), color: "#ffffff", position: 100 },
    ],
  };
}
