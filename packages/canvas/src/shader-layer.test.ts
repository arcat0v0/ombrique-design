import { describe, expect, it } from "vitest";
import { placeShaders, shaderTextureSize } from "./shader-layer";

describe("placeShaders", () => {
  it("keeps document order and drops anchors without a ready canvas", () => {
    const placements = placeShaders(
      [
        {
          id: "a",
          worldX: 40,
          worldY: 60,
          worldW: 200,
          worldH: 120,
          radius: 8,
        },
        { id: "b", worldX: 0, worldY: 0, worldW: 10, worldH: 10, radius: 0 },
        {
          id: "c",
          worldX: 512,
          worldY: 24,
          worldW: 80,
          worldH: 90,
          radius: -4,
        },
        {
          id: "empty",
          worldX: 5,
          worldY: 5,
          worldW: 0,
          worldH: 10,
          radius: 0,
        },
      ],
      new Set(["a", "b", "c", "empty"]),
    );
    expect(placements).toEqual([
      {
        id: "a",
        worldX: 40,
        worldY: 60,
        worldW: 200,
        worldH: 120,
        radius: 8,
      },
      { id: "b", worldX: 0, worldY: 0, worldW: 10, worldH: 10, radius: 0 },
      {
        id: "c",
        worldX: 512,
        worldY: 24,
        worldW: 80,
        worldH: 90,
        radius: 0,
      },
    ]);
  });

  it("keeps only ready shaders and their layout world coordinates", () => {
    const placements = placeShaders(
      [
        {
          id: "ready",
          worldX: 110,
          worldY: 120,
          worldW: 30,
          worldH: 40,
          radius: 0,
        },
        {
          id: "pending",
          worldX: 1,
          worldY: 2,
          worldW: 30,
          worldH: 40,
          radius: 0,
        },
      ],
      new Set(["ready"]),
    );
    expect(placements).toEqual([
      {
        id: "ready",
        worldX: 110,
        worldY: 120,
        worldW: 30,
        worldH: 40,
        radius: 0,
      },
    ]);
  });
});

describe("shaderTextureSize", () => {
  it("matches the shader backing store density", () => {
    expect(shaderTextureSize(210, 150, 1.6667, 8192)).toEqual({
      width: 350,
      height: 250,
    });
    expect(shaderTextureSize(120, 80, 2, 8192)).toEqual({
      width: 240,
      height: 160,
    });
  });

  it("clamps degenerate and oversized requests", () => {
    expect(shaderTextureSize(0, -4, 1, 8192)).toEqual({ width: 1, height: 1 });
    expect(shaderTextureSize(5000, 9000, 1, 4096)).toEqual({
      width: 4096,
      height: 4096,
    });
  });
});
