export type GuideAxis = "x" | "y";
export type GuideFeature = "start" | "center" | "end";

export interface GuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReferenceLine {
  id?: string;
  axis: GuideAxis;
  position: number;
}

export interface SmartGuideLine {
  axis: GuideAxis;
  position: number;
  start: number;
  end: number;
}

export interface EqualSpacingGuide {
  axis: GuideAxis;
  from: number;
  to: number;
  cross: number;
  value: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: SmartGuideLine[];
  spacing: EqualSpacingGuide[];
}

export interface SnapOptions {
  threshold: number;
  references?: ReferenceLine[];
  equalGaps?: Record<GuideAxis, number[]>;
  xFeatures?: GuideFeature[];
  yFeatures?: GuideFeature[];
}

export interface DistanceMeasurement {
  axis: GuideAxis;
  from: number;
  to: number;
  cross: number;
  value: number;
  label: string;
}

const ALL_FEATURES: GuideFeature[] = ["start", "center", "end"];

function getFeature(
  rect: GuideRect,
  axis: GuideAxis,
  feature: GuideFeature,
): number {
  const start = axis === "x" ? rect.x : rect.y;
  const size = axis === "x" ? rect.width : rect.height;
  if (feature === "start") return start;
  if (feature === "end") return start + size;
  return start + size / 2;
}

function hasCrossOverlap(a: GuideRect, b: GuideRect, axis: GuideAxis): boolean {
  const aStart = axis === "x" ? a.y : a.x;
  const aEnd = aStart + (axis === "x" ? a.height : a.width);
  const bStart = axis === "x" ? b.y : b.x;
  const bEnd = bStart + (axis === "x" ? b.height : b.width);
  return aStart < bEnd && aEnd > bStart;
}

function snapAxis(
  rect: GuideRect,
  targets: GuideRect[],
  axis: GuideAxis,
  options: SnapOptions,
): { delta: number; lines: SmartGuideLine[]; spacing: EqualSpacingGuide[] } {
  const features =
    (axis === "x" ? options.xFeatures : options.yFeatures) ?? ALL_FEATURES;
  if (features.length === 0) return { delta: 0, lines: [], spacing: [] };

  const ownStart = axis === "x" ? rect.x : rect.y;
  const ownSize = axis === "x" ? rect.width : rect.height;
  let bestDelta = Number.POSITIVE_INFINITY;
  let matched = false;

  for (const target of targets) {
    for (const feature of features) {
      const own = getFeature(rect, axis, feature);
      for (const targetFeature of ALL_FEATURES) {
        const position = getFeature(target, axis, targetFeature);
        const delta = position - own;
        if (
          Math.abs(delta) <= options.threshold &&
          (!matched || Math.abs(delta) < Math.abs(bestDelta))
        ) {
          matched = true;
          bestDelta = delta;
        }
      }
    }
  }

  for (const reference of options.references ?? []) {
    if (reference.axis !== axis) continue;
    for (const feature of features) {
      const delta = reference.position - getFeature(rect, axis, feature);
      if (
        Math.abs(delta) <= options.threshold &&
        (!matched || Math.abs(delta) < Math.abs(bestDelta))
      ) {
        matched = true;
        bestDelta = delta;
      }
    }
  }

  if (!matched) {
    let before: GuideRect | null = null;
    let after: GuideRect | null = null;
    for (const target of targets) {
      if (!hasCrossOverlap(rect, target, axis)) continue;
      const targetStart = axis === "x" ? target.x : target.y;
      const targetEnd =
        targetStart + (axis === "x" ? target.width : target.height);
      if (targetEnd <= ownStart) {
        if (!before) {
          before = target;
        } else {
          const prevEnd =
            (axis === "x" ? before.x : before.y) +
            (axis === "x" ? before.width : before.height);
          if (targetEnd > prevEnd) before = target;
        }
      } else if (targetStart >= ownStart + ownSize) {
        if (!after) {
          after = target;
        } else {
          const prevStart = axis === "x" ? after.x : after.y;
          if (targetStart < prevStart) after = target;
        }
      }
    }

    let spacingDelta: number | null = null;
    let spacingTargets: GuideRect[] = [];
    const testDelta = (cand: number, candTargets: GuideRect[]) => {
      if (Math.abs(cand) > options.threshold) return;
      if (spacingDelta === null || Math.abs(cand) < Math.abs(spacingDelta)) {
        spacingDelta = cand;
        spacingTargets = candTargets;
      }
    };

    if (before && after) {
      const bEnd =
        (axis === "x" ? before.x : before.y) +
        (axis === "x" ? before.width : before.height);
      const aStart = axis === "x" ? after.x : after.y;
      const cand = (bEnd + aStart - ownSize) / 2 - ownStart;
      const previewStart = ownStart + cand;
      if (previewStart >= bEnd && previewStart + ownSize <= aStart) {
        testDelta(cand, [before, after]);
      }
    }

    const gaps = options.equalGaps?.[axis] ?? [];
    for (const gap of gaps) {
      if (before) {
        const bEnd =
          (axis === "x" ? before.x : before.y) +
          (axis === "x" ? before.width : before.height);
        testDelta(bEnd + gap - ownStart, [before]);
      }
      if (after) {
        const aStart = axis === "x" ? after.x : after.y;
        testDelta(aStart - gap - (ownStart + ownSize), [after]);
      }
    }

    if (spacingDelta === null) return { delta: 0, lines: [], spacing: [] };

    const adjustedRect =
      axis === "x"
        ? { ...rect, x: rect.x + spacingDelta }
        : { ...rect, y: rect.y + spacingDelta };

    const spacingGuides: EqualSpacingGuide[] = spacingTargets.map((target) => {
      const aStart = axis === "x" ? adjustedRect.y : adjustedRect.x;
      const aEnd =
        aStart + (axis === "x" ? adjustedRect.height : adjustedRect.width);
      const tStart = axis === "x" ? target.y : target.x;
      const tEnd = tStart + (axis === "x" ? target.height : target.width);
      const crossStart = Math.max(aStart, tStart);
      const crossEnd = Math.min(aEnd, tEnd);
      const cross =
        crossEnd > crossStart
          ? (crossStart + crossEnd) / 2
          : (aStart + aEnd + tStart + tEnd) / 4;

      const ownPos = axis === "x" ? adjustedRect.x : adjustedRect.y;
      const ownEdge =
        ownPos + (axis === "x" ? adjustedRect.width : adjustedRect.height);
      const tgtPos = axis === "x" ? target.x : target.y;
      const tgtEdge = tgtPos + (axis === "x" ? target.width : target.height);
      const from = tgtEdge <= ownPos ? tgtEdge : ownEdge;
      const to = tgtEdge <= ownPos ? ownPos : tgtPos;
      return {
        axis,
        from,
        to,
        cross,
        value: Math.max(0, to - from),
      };
    });

    return { delta: spacingDelta, lines: [], spacing: spacingGuides };
  }

  const adjustedRect =
    axis === "x"
      ? { ...rect, x: rect.x + bestDelta }
      : { ...rect, y: rect.y + bestDelta };

  const lines: SmartGuideLine[] = [];
  const ownCrossStart = axis === "x" ? adjustedRect.y : adjustedRect.x;
  const ownCrossEnd =
    ownCrossStart + (axis === "x" ? adjustedRect.height : adjustedRect.width);

  for (const target of targets) {
    for (const feature of features) {
      const ownPos = getFeature(adjustedRect, axis, feature);
      for (const targetFeature of ALL_FEATURES) {
        const targetPos = getFeature(target, axis, targetFeature);
        if (Math.abs(ownPos - targetPos) < 0.001) {
          const tCrossStart = axis === "x" ? target.y : target.x;
          const tCrossEnd =
            tCrossStart + (axis === "x" ? target.height : target.width);
          const start = Math.min(ownCrossStart, tCrossStart);
          const end = Math.max(ownCrossEnd, tCrossEnd);
          const existing = lines.find(
            (line) => Math.abs(line.position - targetPos) < 0.001,
          );
          if (existing) {
            existing.start = Math.min(existing.start, start);
            existing.end = Math.max(existing.end, end);
          } else {
            lines.push({ axis, position: targetPos, start, end });
          }
        }
      }
    }
  }

  for (const reference of options.references ?? []) {
    if (reference.axis !== axis) continue;
    for (const feature of features) {
      const ownPos = getFeature(adjustedRect, axis, feature);
      if (Math.abs(ownPos - reference.position) < 0.001) {
        const existing = lines.find(
          (line) => Math.abs(line.position - reference.position) < 0.001,
        );
        if (existing) {
          existing.start = Math.min(existing.start, ownCrossStart);
          existing.end = Math.max(existing.end, ownCrossEnd);
        } else {
          lines.push({
            axis,
            position: reference.position,
            start: ownCrossStart,
            end: ownCrossEnd,
          });
        }
      }
    }
  }

  return { delta: bestDelta, lines, spacing: [] };
}

export function snapRectToGuides(
  rect: GuideRect,
  targets: GuideRect[],
  options: SnapOptions,
): SnapResult {
  const horizontal = snapAxis(rect, targets, "x", options);
  const vertical = snapAxis(rect, targets, "y", options);
  return {
    dx: horizontal.delta,
    dy: vertical.delta,
    lines: [...horizontal.lines, ...vertical.lines],
    spacing: [...horizontal.spacing, ...vertical.spacing],
  };
}

export function collectEqualGaps(
  targets: GuideRect[],
): Record<GuideAxis, number[]> {
  const result: Record<GuideAxis, number[]> = { x: [], y: [] };
  for (const axis of ["x", "y"] as const) {
    const frequencies = new Map<number, number>();
    for (let i = 0; i < targets.length; i++) {
      const a = targets[i];
      if (!a) continue;
      for (let j = i + 1; j < targets.length; j++) {
        const b = targets[j];
        if (!b || !hasCrossOverlap(a, b, axis)) continue;
        const aStart = axis === "x" ? a.x : a.y;
        const aEnd = aStart + (axis === "x" ? a.width : a.height);
        const bStart = axis === "x" ? b.x : b.y;
        const bEnd = bStart + (axis === "x" ? b.width : b.height);
        const gap =
          aEnd <= bStart ? bStart - aEnd : bEnd <= aStart ? aStart - bEnd : -1;
        if (gap < 0.5) continue;
        const rounded = Math.round(gap * 100) / 100;
        frequencies.set(rounded, (frequencies.get(rounded) ?? 0) + 1);
      }
    }
    result[axis] = [...frequencies]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 24)
      .map(([gap]) => gap);
  }
  return result;
}

export function measureBetweenRects(
  selected: GuideRect,
  hovered: GuideRect,
): DistanceMeasurement[] {
  const measurements: DistanceMeasurement[] = [];
  const overlapsX =
    selected.x < hovered.x + hovered.width &&
    selected.x + selected.width > hovered.x;
  const overlapsY =
    selected.y < hovered.y + hovered.height &&
    selected.y + selected.height > hovered.y;

  if (overlapsX && overlapsY) {
    const topGap = Math.abs(selected.y - hovered.y);
    const bottomGap = Math.abs(
      selected.y + selected.height - (hovered.y + hovered.height),
    );
    const leftGap = Math.abs(selected.x - hovered.x);
    const rightGap = Math.abs(
      selected.x + selected.width - (hovered.x + hovered.width),
    );

    const centerX = selected.x + selected.width / 2;
    const centerY = selected.y + selected.height / 2;

    if (topGap >= 1) {
      const from = Math.min(selected.y, hovered.y);
      const to = Math.max(selected.y, hovered.y);
      measurements.push({
        axis: "y",
        from,
        to,
        cross: centerX,
        value: Math.round(topGap),
        label: `${Math.round(topGap)}`,
      });
    }
    if (bottomGap >= 1) {
      const sB = selected.y + selected.height;
      const hB = hovered.y + hovered.height;
      const from = Math.min(sB, hB);
      const to = Math.max(sB, hB);
      measurements.push({
        axis: "y",
        from,
        to,
        cross: centerX,
        value: Math.round(bottomGap),
        label: `${Math.round(bottomGap)}`,
      });
    }
    if (leftGap >= 1) {
      const from = Math.min(selected.x, hovered.x);
      const to = Math.max(selected.x, hovered.x);
      measurements.push({
        axis: "x",
        from,
        to,
        cross: centerY,
        value: Math.round(leftGap),
        label: `${Math.round(leftGap)}`,
      });
    }
    if (rightGap >= 1) {
      const sR = selected.x + selected.width;
      const hR = hovered.x + hovered.width;
      const from = Math.min(sR, hR);
      const to = Math.max(sR, hR);
      measurements.push({
        axis: "x",
        from,
        to,
        cross: centerY,
        value: Math.round(rightGap),
        label: `${Math.round(rightGap)}`,
      });
    }
    return measurements;
  }

  const sRight = selected.x + selected.width;
  const hRight = hovered.x + hovered.width;
  const sBottom = selected.y + selected.height;
  const hBottom = hovered.y + hovered.height;

  if (sRight <= hovered.x) {
    const cross = overlapsY
      ? (Math.max(selected.y, hovered.y) + Math.min(sBottom, hBottom)) / 2
      : selected.y + selected.height / 2;
    measurements.push({
      axis: "x",
      from: sRight,
      to: hovered.x,
      cross,
      value: Math.round(hovered.x - sRight),
      label: `${Math.round(hovered.x - sRight)}`,
    });
  } else if (hRight <= selected.x) {
    const cross = overlapsY
      ? (Math.max(selected.y, hovered.y) + Math.min(sBottom, hBottom)) / 2
      : selected.y + selected.height / 2;
    measurements.push({
      axis: "x",
      from: hRight,
      to: selected.x,
      cross,
      value: Math.round(selected.x - hRight),
      label: `${Math.round(selected.x - hRight)}`,
    });
  }

  if (sBottom <= hovered.y) {
    const cross = overlapsX
      ? (Math.max(selected.x, hovered.x) + Math.min(sRight, hRight)) / 2
      : selected.x + selected.width / 2;
    measurements.push({
      axis: "y",
      from: sBottom,
      to: hovered.y,
      cross,
      value: Math.round(hovered.y - sBottom),
      label: `${Math.round(hovered.y - sBottom)}`,
    });
  } else if (hBottom <= selected.y) {
    const cross = overlapsX
      ? (Math.max(selected.x, hovered.x) + Math.min(sRight, hRight)) / 2
      : selected.x + selected.width / 2;
    measurements.push({
      axis: "y",
      from: hBottom,
      to: selected.y,
      cross,
      value: Math.round(selected.y - hBottom),
      label: `${Math.round(selected.y - hBottom)}`,
    });
  }

  return measurements;
}
