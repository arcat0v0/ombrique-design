import { describe, expect, it } from "vitest";
import {
  collectEqualGaps,
  measureBetweenRects,
  snapRectToGuides,
} from "./guides";

describe("snapRectToGuides", () => {
  it("snaps edge to edge within threshold", () => {
    const dragging = { x: 98, y: 50, width: 100, height: 100 };
    const targets = [{ x: 100, y: 200, width: 80, height: 80 }];
    const result = snapRectToGuides(dragging, targets, { threshold: 5 });

    expect(result.dx).toBe(2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toEqual({
      axis: "x",
      position: 100,
      start: 50,
      end: 280,
    });
  });

  it("snaps centers together", () => {
    const dragging = { x: 50, y: 198, width: 100, height: 100 }; // center y = 248
    const targets = [{ x: 300, y: 200, width: 100, height: 100 }]; // center y = 250
    const result = snapRectToGuides(dragging, targets, { threshold: 5 });

    expect(result.dy).toBe(2);
    expect(result.lines.some((l) => l.axis === "y" && l.position === 250)).toBe(
      true,
    );
  });

  it("snaps to reference line", () => {
    const dragging = { x: 52, y: 50, width: 100, height: 100 };
    const result = snapRectToGuides(dragging, [], {
      threshold: 5,
      references: [{ axis: "x", position: 50 }],
    });

    expect(result.dx).toBe(-2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.position).toBe(50);
  });

  it("snaps to equal spacing between two existing items", () => {
    const before = { x: 0, y: 0, width: 100, height: 100 };
    const after = { x: 300, y: 0, width: 100, height: 100 };
    // Between 100 and 300, available gap is 200. With width 100, centered position is x = 150 (gap 50 each).
    const dragging = { x: 148, y: 0, width: 100, height: 100 };
    const result = snapRectToGuides(dragging, [before, after], {
      threshold: 5,
    });

    expect(result.dx).toBe(2);
    expect(result.spacing).toHaveLength(2);
    expect(result.spacing[0]?.value).toBe(50);
  });

  it("snaps to matching gap distance", () => {
    const targets = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 140, y: 0, width: 100, height: 100 }, // gap is 40
    ];
    const gaps = collectEqualGaps(targets);
    expect(gaps.x).toContain(40);

    const dragging = { x: 278, y: 0, width: 100, height: 100 }; // after 240, 240 + 40 = 280
    const result = snapRectToGuides(dragging, targets, {
      threshold: 5,
      equalGaps: gaps,
    });

    expect(result.dx).toBe(2);
    expect(result.spacing).toHaveLength(1);
    expect(result.spacing[0]?.value).toBe(40);
  });
});

describe("measureBetweenRects", () => {
  it("measures distance between separated rects horizontally and vertically", () => {
    const selected = { x: 0, y: 0, width: 100, height: 100 };
    const hovered = { x: 150, y: 200, width: 80, height: 80 };
    const measurements = measureBetweenRects(selected, hovered);

    const xMeasure = measurements.find((m) => m.axis === "x");
    const yMeasure = measurements.find((m) => m.axis === "y");
    expect(xMeasure?.value).toBe(50);
    expect(yMeasure?.value).toBe(100);
  });

  it("measures internal distances for overlapping rects", () => {
    const container = { x: 0, y: 0, width: 200, height: 200 };
    const child = { x: 20, y: 30, width: 100, height: 80 };
    const measurements = measureBetweenRects(child, container);

    const left = measurements.find((m) => m.axis === "x" && m.from === 0);
    const top = measurements.find((m) => m.axis === "y" && m.from === 0);
    expect(left?.value).toBe(20);
    expect(top?.value).toBe(30);
  });
});
