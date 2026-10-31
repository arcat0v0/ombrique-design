import { describe, expect, it } from "vitest";
import {
  addPointToPath,
  deleteAnchorPoint,
  getAnchorPoints,
  getControlHandles,
  moveAnchorPoint,
  moveControlHandle,
  parseSVGPath,
  serializePath,
} from "./path-utils";

describe("parseSVGPath", () => {
  it("parses absolute commands with repeated groups", () => {
    const segments = parseSVGPath("M 0 0 L 10 0 20 0 C 30 0 40 0 50 0 Z");
    expect(segments.map((s) => s.type)).toEqual(["M", "L", "L", "C", "Z"]);
  });

  it("parses relative commands and normalizes to absolute", () => {
    const segments = parseSVGPath("m 10 10 l 5 0 c 1 1 2 2 3 3");
    expect(segments[0]).toEqual({ type: "M", points: [{ x: 10, y: 10 }] });
    expect(segments[1]).toEqual({ type: "L", points: [{ x: 15, y: 10 }] });
    expect(segments[2]).toEqual({
      type: "C",
      points: [
        { x: 16, y: 11 },
        { x: 17, y: 12 },
        { x: 18, y: 13 },
      ],
    });
  });

  it("rejects unsupported commands and malformed data", () => {
    expect(() => parseSVGPath("M 0 0 A 1 1 0 0 1 4 4")).toThrow();
    expect(() => parseSVGPath("L 0 0")).toThrow();
    expect(() => parseSVGPath("M 0")).toThrow();
    expect(() => parseSVGPath("M 0 0 X")).toThrow();
  });
});

describe("serializePath", () => {
  it("round-trips parsed data", () => {
    const d = "M 0 0 L 10 10 C 20 0 30 0 40 10 Q 50 20 60 10 Z";
    expect(serializePath(parseSVGPath(d))).toBe(d);
  });
});

describe("anchor and handle extraction", () => {
  it("returns endpoints in order", () => {
    expect(getAnchorPoints("M 0 0 L 10 0 C 20 0 30 0 40 0")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 40, y: 0 },
    ]);
  });

  it("exposes incoming handle as 0 and outgoing as 1", () => {
    const handles = getControlHandles("M 0 0 C 1 0 2 0 3 0");
    expect(handles).toEqual([
      { point: { x: 1, y: 0 }, anchorIndex: 0, handleIndex: 1 },
      { point: { x: 2, y: 0 }, anchorIndex: 1, handleIndex: 0 },
    ]);
  });
});

describe("moveAnchorPoint", () => {
  it("translates adjacent control handles", () => {
    const next = moveAnchorPoint("M 0 0 C 1 0 2 0 3 0 L 6 0", 1, 13, 10);
    expect(getAnchorPoints(next)[1]).toEqual({ x: 13, y: 10 });
    expect(getControlHandles(next)).toContainEqual({
      point: { x: 12, y: 10 },
      anchorIndex: 1,
      handleIndex: 0,
    });
  });

  it("rejects invalid indices", () => {
    expect(() => moveAnchorPoint("M 0 0", 1, 0, 0)).toThrow();
  });
});

describe("moveControlHandle", () => {
  it("moves only the selected handle", () => {
    const next = moveControlHandle("M 0 0 C 1 0 2 0 3 0", 0, 1, 5, 5);
    expect(getControlHandles(next)).toContainEqual({
      point: { x: 5, y: 5 },
      anchorIndex: 0,
      handleIndex: 1,
    });
  });

  it("throws when the handle does not exist", () => {
    expect(() => moveControlHandle("M 0 0 L 1 1", 0, 1, 5, 5)).toThrow();
  });
});

describe("deleteAnchorPoint", () => {
  it("removes a middle anchor and bridges the gap", () => {
    const next = deleteAnchorPoint("M 0 0 L 10 0 L 20 0", 1);
    expect(getAnchorPoints(next)).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
  });

  it("promotes the next anchor when removing the first", () => {
    const next = deleteAnchorPoint("M 0 0 L 10 0 L 20 0", 0);
    expect(getAnchorPoints(next)).toEqual([
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(parseSVGPath(next)[0]?.type).toBe("M");
  });

  it("keeps a degenerate path for the last remaining anchor", () => {
    expect(deleteAnchorPoint("M 5 5", 0)).toBe("M 0 0");
  });
});

describe("addPointToPath", () => {
  it("splits the nearest line segment", () => {
    const next = addPointToPath("M 0 0 L 100 0", 50, 2);
    expect(getAnchorPoints(next)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 2 },
      { x: 100, y: 0 },
    ]);
  });

  it("splits a cubic segment while preserving the curve endpoints", () => {
    const d = "M 0 0 C 0 100 100 100 100 0";
    const next = addPointToPath(d, 50, 80);
    const anchors = getAnchorPoints(next);
    expect(anchors[0]).toEqual({ x: 0, y: 0 });
    expect(anchors[2]).toEqual({ x: 100, y: 0 });
    expect(anchors[1]?.x).toBe(50);
    expect(anchors[1]?.y).toBe(80);
    expect(parseSVGPath(next).filter((s) => s.type === "C")).toHaveLength(2);
  });

  it("rejects non-finite coordinates", () => {
    expect(() => addPointToPath("M 0 0", Number.NaN, 0)).toThrow();
  });
});
