import { describe, expect, it } from "vitest";
import {
  intersects,
  screenToWorld,
  visibleRect,
  worldToScreen,
  zoomAt,
} from "./camera";

describe("zoomAt", () => {
  it("keeps the world point under the cursor fixed", () => {
    const cam = { x: 10, y: 20, z: 1 };
    const next = zoomAt(cam, 2, 400, 300, 0.05, 32);
    const before = screenToWorld(cam, 400, 300);
    const after = screenToWorld(next, 400, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.z).toBe(2);
    expect(cam.z).toBe(1);
  });

  it("zooms out around the cursor", () => {
    const cam = { x: 0, y: 0, z: 4 };
    const next = zoomAt(cam, 0.5, 200, 100, 0.05, 32);
    const before = screenToWorld(cam, 200, 100);
    const after = screenToWorld(next, 200, 100);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.z).toBe(2);
  });

  it("clamps to min zoom", () => {
    const cam = { x: 5, y: 5, z: 0.1 };
    const next = zoomAt(cam, 0.1, 100, 100, 0.05, 32);
    expect(next.z).toBe(0.05);
    const before = screenToWorld(cam, 100, 100);
    const after = screenToWorld(next, 100, 100);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps to max zoom", () => {
    const cam = { x: 0, y: 0, z: 16 };
    const next = zoomAt(cam, 4, 50, 50, 0.05, 32);
    expect(next.z).toBe(32);
  });

  it("returns an equal camera when already at the clamp", () => {
    const cam = { x: 3, y: 4, z: 32 };
    const next = zoomAt(cam, 2, 10, 10, 0.05, 32);
    expect(next).toEqual(cam);
  });
});

describe("screenToWorld / worldToScreen", () => {
  it("round-trips", () => {
    const cam = { x: 12, y: -8, z: 3 };
    const w = screenToWorld(cam, 480, 270);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(480);
    expect(s.y).toBeCloseTo(270);
  });

  it("accounts for zoom", () => {
    const cam = { x: 0, y: 0, z: 2 };
    expect(screenToWorld(cam, 100, 50)).toEqual({ x: 50, y: 25 });
    expect(worldToScreen(cam, 50, 25)).toEqual({ x: 100, y: 50 });
  });
});

describe("visibleRect", () => {
  it("covers the viewport in world space", () => {
    const cam = { x: 100, y: 200, z: 2 };
    expect(visibleRect(cam, 800, 600)).toEqual({
      x: 100,
      y: 200,
      w: 400,
      h: 300,
    });
  });

  it("grows as zoom shrinks", () => {
    const cam = { x: 0, y: 0, z: 0.5 };
    expect(visibleRect(cam, 800, 600)).toEqual({
      x: 0,
      y: 0,
      w: 1600,
      h: 1200,
    });
  });
});

describe("intersects", () => {
  it("is true for overlapping rects", () => {
    expect(
      intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }),
    ).toBe(true);
  });

  it("is true for edge tangency", () => {
    expect(
      intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }),
    ).toBe(true);
    expect(
      intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 }),
    ).toBe(true);
    expect(
      intersects(
        { x: 0, y: 0, w: 10, h: 10 },
        { x: -10, y: -10, w: 10, h: 10 },
      ),
    ).toBe(true);
  });

  it("is false for disjoint rects", () => {
    expect(
      intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 }),
    ).toBe(false);
    expect(
      intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: -20, w: 5, h: 5 }),
    ).toBe(false);
  });

  it("treats a zero-area rect on an edge as intersecting", () => {
    expect(
      intersects({ x: 10, y: 10, w: 0, h: 0 }, { x: 0, y: 0, w: 10, h: 10 }),
    ).toBe(true);
  });
});
