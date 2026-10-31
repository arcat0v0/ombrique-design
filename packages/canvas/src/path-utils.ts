export interface Point {
  x: number;
  y: number;
}

export type PathSegment =
  | { type: "M"; points: [Point] }
  | { type: "L"; points: [Point] }
  | { type: "C"; points: [Point, Point, Point] }
  | { type: "Q"; points: [Point, Point] }
  | { type: "Z"; points: [] };

export interface Handle {
  point: Point;
  anchorIndex: number;
  handleIndex: number;
}

interface Token {
  value: string;
  position: number;
}

interface ControlReference {
  segmentIndex: number;
  pointIndex: number;
}

interface AnchorLocation {
  segmentIndex: number;
  pointIndex: number;
  outgoing: ControlReference[];
}

function isCommand(value: string): boolean {
  if (value.length !== 1) return false;
  const code = value.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function tokenize(d: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]/g;
  let lastIndex = 0;
  let match = pattern.exec(d);

  while (match !== null) {
    const separator = d.slice(lastIndex, match.index);
    if (!/^\s*,?\s*$/.test(separator)) {
      throw new Error(
        `Invalid SVG path at position ${lastIndex}: expected a number, command, whitespace, or comma`,
      );
    }
    if (separator.includes(",")) {
      const previous = tokens[tokens.length - 1];
      if (!previous || isCommand(previous.value) || isCommand(match[0])) {
        throw new Error(
          `Invalid SVG path at position ${lastIndex}: unexpected comma`,
        );
      }
    }
    tokens.push({ value: match[0], position: match.index });
    lastIndex = match.index + match[0].length;
    match = pattern.exec(d);
  }

  const trailing = d.slice(lastIndex);
  if (!/^\s*$/.test(trailing)) {
    throw new Error(
      `Invalid SVG path at position ${lastIndex}: unexpected ${
        trailing.includes(",") ? "comma" : "characters"
      }`,
    );
  }
  return tokens;
}

export function parseSVGPath(d: string): PathSegment[] {
  if (typeof d !== "string") {
    throw new TypeError("SVG path data must be a string");
  }
  const tokens = tokenize(d);
  const first = tokens[0];
  if (!first || !isCommand(first.value)) {
    throw new Error("Invalid SVG path: path must start with M or m");
  }
  if (first.value !== "M" && first.value !== "m") {
    throw new Error(
      `Invalid SVG path at position ${first.position}: path must start with M or m`,
    );
  }

  const segments: PathSegment[] = [];
  let cursor = 0;
  let currentX = 0;
  let currentY = 0;
  let subpathX = 0;
  let subpathY = 0;

  const coordinate = (index: number): number => {
    const token = tokens[index];
    if (!token || isCommand(token.value)) {
      throw new Error("Invalid SVG path: missing coordinate");
    }
    const value = Number(token.value);
    if (!Number.isFinite(value)) {
      throw new Error(
        `Invalid SVG path at position ${token.position}: coordinate must be finite`,
      );
    }
    return value;
  };

  while (cursor < tokens.length) {
    const commandToken = tokens[cursor];
    if (!commandToken || !isCommand(commandToken.value)) {
      const position = commandToken?.position ?? d.length;
      throw new Error(
        `Invalid SVG path at position ${position}: expected a command`,
      );
    }
    cursor += 1;
    const command = commandToken.value;
    const upper = command.toUpperCase();
    if (!["M", "L", "C", "Q", "Z"].includes(upper)) {
      throw new Error(
        `Unsupported SVG path command "${command}" at position ${commandToken.position}`,
      );
    }

    if (upper === "Z") {
      segments.push({ type: "Z", points: [] });
      currentX = subpathX;
      currentY = subpathY;
      continue;
    }

    const endSearch = cursor;
    let end = endSearch;
    while (end < tokens.length) {
      const token = tokens[end];
      if (!token || isCommand(token.value)) break;
      end += 1;
    }
    const count = end - cursor;
    const arity = upper === "M" || upper === "L" ? 2 : upper === "C" ? 6 : 4;
    if (count === 0 || count % arity !== 0) {
      throw new Error(
        `Invalid SVG path command "${command}" at position ${commandToken.position}: expected groups of ${arity} coordinates`,
      );
    }

    const relative = command !== upper;
    if (upper === "M") {
      let group = 0;
      for (let offset = cursor; offset < end; offset += 2) {
        const x = coordinate(offset) + (relative ? currentX : 0);
        const y = coordinate(offset + 1) + (relative ? currentY : 0);
        if (group === 0) {
          segments.push({ type: "M", points: [{ x, y }] });
          subpathX = x;
          subpathY = y;
        } else {
          segments.push({ type: "L", points: [{ x, y }] });
        }
        currentX = x;
        currentY = y;
        group += 1;
      }
    } else if (upper === "L") {
      for (let offset = cursor; offset < end; offset += 2) {
        const x = coordinate(offset) + (relative ? currentX : 0);
        const y = coordinate(offset + 1) + (relative ? currentY : 0);
        segments.push({ type: "L", points: [{ x, y }] });
        currentX = x;
        currentY = y;
      }
    } else if (upper === "C") {
      for (let offset = cursor; offset < end; offset += 6) {
        const originX = currentX;
        const originY = currentY;
        const dx = relative ? originX : 0;
        const dy = relative ? originY : 0;
        const control1 = {
          x: coordinate(offset) + dx,
          y: coordinate(offset + 1) + dy,
        };
        const control2 = {
          x: coordinate(offset + 2) + dx,
          y: coordinate(offset + 3) + dy,
        };
        const endPoint = {
          x: coordinate(offset + 4) + dx,
          y: coordinate(offset + 5) + dy,
        };
        segments.push({ type: "C", points: [control1, control2, endPoint] });
        currentX = endPoint.x;
        currentY = endPoint.y;
      }
    } else {
      for (let offset = cursor; offset < end; offset += 4) {
        const dx = relative ? currentX : 0;
        const dy = relative ? currentY : 0;
        const control = {
          x: coordinate(offset) + dx,
          y: coordinate(offset + 1) + dy,
        };
        const endPoint = {
          x: coordinate(offset + 2) + dx,
          y: coordinate(offset + 3) + dy,
        };
        segments.push({ type: "Q", points: [control, endPoint] });
        currentX = endPoint.x;
        currentY = endPoint.y;
      }
    }
    cursor = end;
  }

  return segments;
}

function assertFinitePoint(point: Point, context: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${context} coordinates must be finite numbers`);
  }
}

function serializeNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

export function serializePath(segments: PathSegment[]): string {
  if (!Array.isArray(segments)) {
    throw new TypeError("Path segments must be an array");
  }
  if (segments.length > 0 && segments[0]?.type !== "M") {
    throw new Error("Invalid path segments: path must start with M");
  }

  return segments
    .map((segment, segmentIndex) => {
      const expected =
        segment.type === "M" || segment.type === "L"
          ? 1
          : segment.type === "C"
            ? 3
            : segment.type === "Q"
              ? 2
              : segment.type === "Z"
                ? 0
                : -1;
      if (expected < 0) {
        throw new Error(
          `Invalid path segment at index ${segmentIndex}: unsupported type`,
        );
      }
      if (segment.points.length !== expected) {
        throw new Error(
          `Invalid ${segment.type} segment at index ${segmentIndex}: expected ${expected} points`,
        );
      }
      for (const point of segment.points) {
        assertFinitePoint(point, `Path segment ${segmentIndex}`);
      }
      if (segment.type === "Z") return "Z";
      return `${segment.type} ${segment.points
        .map(
          (point) => `${serializeNumber(point.x)} ${serializeNumber(point.y)}`,
        )
        .join(" ")}`;
    })
    .join(" ");
}

export function getAnchorPoints(d: string): Point[] {
  return parseSVGPath(d)
    .filter((segment) => segment.type !== "Z")
    .map((segment) => {
      const point = segment.points[segment.points.length - 1];
      if (!point) throw new Error("Invalid path segment: missing anchor point");
      return { x: point.x, y: point.y };
    });
}

function anchorLocations(segments: PathSegment[]): AnchorLocation[] {
  const locations: AnchorLocation[] = [];
  let currentAnchor: number | null = null;
  let subpathAnchor: number | null = null;

  for (
    let segmentIndex = 0;
    segmentIndex < segments.length;
    segmentIndex += 1
  ) {
    const segment = segments[segmentIndex];
    if (!segment) continue;
    if (segment.type === "Z") {
      currentAnchor = subpathAnchor;
      continue;
    }
    if (segment.type !== "M") {
      if (currentAnchor === null) {
        throw new Error("Invalid path segments: missing current anchor");
      }
      if (segment.type === "C" || segment.type === "Q") {
        locations[currentAnchor]?.outgoing.push({
          segmentIndex,
          pointIndex: 0,
        });
      }
    }
    const anchorIndex = locations.length;
    locations.push({
      segmentIndex,
      pointIndex: segment.points.length - 1,
      outgoing: [],
    });
    currentAnchor = anchorIndex;
    if (segment.type === "M") subpathAnchor = anchorIndex;
  }
  return locations;
}

export function getControlHandles(d: string): Handle[] {
  const segments = parseSVGPath(d);
  const locations = anchorLocations(segments);
  const handles: Handle[] = [];

  for (let anchorIndex = 0; anchorIndex < locations.length; anchorIndex += 1) {
    const location = locations[anchorIndex];
    if (!location) continue;
    const incomingSegment = segments[location.segmentIndex];
    if (incomingSegment?.type === "C") {
      const point = incomingSegment.points[1];
      handles.push({
        point: { x: point.x, y: point.y },
        anchorIndex,
        handleIndex: 0,
      });
    }
    for (const reference of location.outgoing) {
      const outgoingSegment = segments[reference.segmentIndex];
      if (outgoingSegment?.type !== "C") continue;
      const point = outgoingSegment.points[0];
      handles.push({
        point: { x: point.x, y: point.y },
        anchorIndex,
        handleIndex: 1,
      });
    }
  }
  return handles;
}

function assertAnchorIndex(index: number, count: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(
      `Invalid anchor index ${index}: expected an integer from 0 to ${count - 1}`,
    );
  }
}

function assertCoordinates(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("New coordinates must be finite numbers");
  }
}

export function moveAnchorPoint(
  d: string,
  index: number,
  newX: number,
  newY: number,
): string {
  assertCoordinates(newX, newY);
  const segments = parseSVGPath(d);
  const locations = anchorLocations(segments);
  assertAnchorIndex(index, locations.length);
  const location = locations[index];
  if (!location) throw new Error(`Invalid anchor index ${index}`);
  const segment = segments[location.segmentIndex];
  const anchor = segment?.points[location.pointIndex];
  if (!segment || !anchor) throw new Error(`Invalid anchor index ${index}`);
  const dx = newX - anchor.x;
  const dy = newY - anchor.y;
  anchor.x = newX;
  anchor.y = newY;

  if (segment.type === "C" || segment.type === "Q") {
    const incoming =
      segment.type === "C" ? segment.points[1] : segment.points[0];
    incoming.x += dx;
    incoming.y += dy;
  }
  for (const reference of location.outgoing) {
    const outgoingSegment = segments[reference.segmentIndex];
    if (outgoingSegment?.type !== "C" && outgoingSegment?.type !== "Q")
      continue;
    const outgoing = outgoingSegment.points[reference.pointIndex];
    if (!outgoing)
      throw new Error("Invalid path segments: missing control point");
    outgoing.x += dx;
    outgoing.y += dy;
  }
  return serializePath(segments);
}

export function moveControlHandle(
  d: string,
  pointIndex: number,
  handleIndex: number,
  newX: number,
  newY: number,
): string {
  assertCoordinates(newX, newY);
  const segments = parseSVGPath(d);
  const locations = anchorLocations(segments);
  assertAnchorIndex(pointIndex, locations.length);
  if (handleIndex !== 0 && handleIndex !== 1) {
    throw new Error(
      `Invalid handle index ${handleIndex}: expected 0 for incoming or 1 for outgoing`,
    );
  }
  const location = locations[pointIndex];
  if (!location) throw new Error(`Invalid anchor index ${pointIndex}`);

  if (handleIndex === 0) {
    const segment = segments[location.segmentIndex];
    if (segment?.type !== "C") {
      throw new Error(
        `Anchor ${pointIndex} has no incoming cubic control handle`,
      );
    }
    segment.points[1] = { x: newX, y: newY };
    return serializePath(segments);
  }

  const outgoing = location.outgoing.filter(
    (reference) => segments[reference.segmentIndex]?.type === "C",
  );
  if (outgoing.length === 0) {
    throw new Error(
      `Anchor ${pointIndex} has no outgoing cubic control handle`,
    );
  }
  if (outgoing.length > 1) {
    throw new Error(
      `Anchor ${pointIndex} has multiple outgoing cubic control handles`,
    );
  }
  const reference = outgoing[0];
  const segment = reference ? segments[reference.segmentIndex] : undefined;
  if (segment?.type !== "C") {
    throw new Error(
      `Anchor ${pointIndex} has no outgoing cubic control handle`,
    );
  }
  segment.points[0] = { x: newX, y: newY };
  return serializePath(segments);
}

export function deleteAnchorPoint(d: string, index: number): string {
  const segments = parseSVGPath(d);
  const locations = anchorLocations(segments);
  assertAnchorIndex(index, locations.length);
  if (locations.length <= 1) return "M 0 0";
  const targetLoc = locations[index];
  if (!targetLoc) return d;
  if (index === 0) {
    const nextLoc = locations[1];
    if (!nextLoc) return "M 0 0";
    const nextSeg = segments[nextLoc.segmentIndex];
    if (!nextSeg) return "M 0 0";
    const nextAnchor = nextSeg.points[nextSeg.points.length - 1];
    if (!nextAnchor) return "M 0 0";
    segments.splice(0, nextLoc.segmentIndex + 1, {
      type: "M",
      points: [{ x: nextAnchor.x, y: nextAnchor.y }],
    });
  } else {
    segments.splice(targetLoc.segmentIndex, 1);
  }
  return serializePath(segments);
}
export function addPointToPath(d: string, x: number, y: number): string {
  assertCoordinates(x, y);
  const segments = parseSVGPath(d);
  if (segments.length === 0) return `M ${x} ${y}`;
  let bestDist = Infinity;
  let bestIndex = segments.length;
  let bestReplacement: PathSegment[] | null = null;
  let prevPoint: Point = segments[0]?.points[0] ?? { x: 0, y: 0 };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (seg.type === "M") {
      prevPoint = seg.points[0];
      continue;
    }
    if (seg.type === "L") {
      const p0 = prevPoint;
      const p1 = seg.points[0];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const lenSq = dx * dx + dy * dy;
      const t =
        lenSq === 0
          ? 0.5
          : Math.max(
              0.05,
              Math.min(0.95, ((x - p0.x) * dx + (y - p0.y) * dy) / lenSq),
            );
      const projX = p0.x + t * dx;
      const projY = p0.y + t * dy;
      const dist = Math.hypot(x - projX, y - projY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
        bestReplacement = [
          { type: "L", points: [{ x, y }] },
          { type: "L", points: [p1] },
        ];
      }
      prevPoint = p1;
    } else if (seg.type === "C") {
      const p0 = prevPoint;
      const cp1 = seg.points[0];
      const cp2 = seg.points[1];
      const p3 = seg.points[2];
      let segBestT = 0.5;
      let segBestDist = Infinity;
      for (let step = 1; step <= 20; step++) {
        const t = step / 21;
        const oneMinusT = 1 - t;
        const bx =
          oneMinusT * oneMinusT * oneMinusT * p0.x +
          3 * oneMinusT * oneMinusT * t * cp1.x +
          3 * oneMinusT * t * t * cp2.x +
          t * t * t * p3.x;
        const by =
          oneMinusT * oneMinusT * oneMinusT * p0.y +
          3 * oneMinusT * oneMinusT * t * cp1.y +
          3 * oneMinusT * t * t * cp2.y +
          t * t * t * p3.y;
        const d2 = Math.hypot(x - bx, y - by);
        if (d2 < segBestDist) {
          segBestDist = d2;
          segBestT = t;
        }
      }
      if (segBestDist < bestDist) {
        bestDist = segBestDist;
        bestIndex = i;
        const t = segBestT;
        const p01 = {
          x: p0.x + (cp1.x - p0.x) * t,
          y: p0.y + (cp1.y - p0.y) * t,
        };
        const p12 = {
          x: cp1.x + (cp2.x - cp1.x) * t,
          y: cp1.y + (cp2.y - cp1.y) * t,
        };
        const p23 = {
          x: cp2.x + (p3.x - cp2.x) * t,
          y: cp2.y + (p3.y - cp2.y) * t,
        };
        const p012 = {
          x: p01.x + (p12.x - p01.x) * t,
          y: p01.y + (p12.y - p01.y) * t,
        };
        const p123 = {
          x: p12.x + (p23.x - p12.x) * t,
          y: p12.y + (p23.y - p12.y) * t,
        };
        bestReplacement = [
          { type: "C", points: [p01, p012, { x, y }] },
          { type: "C", points: [p123, p23, p3] },
        ];
      }
      prevPoint = p3;
    } else if (seg.type === "Q") {
      prevPoint = seg.points[1];
    }
  }

  if (bestReplacement && bestIndex < segments.length) {
    segments.splice(bestIndex, 1, ...bestReplacement);
  } else {
    segments.push({ type: "L", points: [{ x, y }] });
  }
  return serializePath(segments);
}
