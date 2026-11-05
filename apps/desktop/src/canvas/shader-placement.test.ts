import { describe, expect, it, vi } from "vitest";
import { collectShaderBoards, layoutShaderAnchors } from "./shader-placement";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubRect(
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    rect(left, top, width, height),
  );
}

describe("layoutShaderAnchors", () => {
  it("uses the laid-out rect so nested frame offsets accumulate", () => {
    const placements = layoutShaderAnchors([
      {
        origin: { x: 0, y: 0 },
        boardRect: { left: 100, top: 50, width: 1440, height: 900 },
        scale: 1,
        anchors: [
          {
            id: "nested",
            radius: 12,
            clientRect: {
              left: 100 + 100 + 10,
              top: 50 + 100 + 20,
              width: 80,
              height: 40,
            },
          },
        ],
      },
    ]);
    expect(placements).toEqual([
      {
        id: "nested",
        worldX: 110,
        worldY: 120,
        worldW: 80,
        worldH: 40,
        radius: 12,
      },
    ]);
  });

  it("respects auto-layout results for sibling shader nodes", () => {
    const placements = layoutShaderAnchors([
      {
        origin: { x: 500, y: 0 },
        boardRect: { left: 760, top: 40, width: 1440, height: 900 },
        scale: 1,
        anchors: [
          {
            id: "first",
            radius: 0,
            clientRect: { left: 760, top: 40, width: 200, height: 100 },
          },
          {
            id: "second",
            radius: 0,
            clientRect: { left: 760 + 224, top: 40, width: 200, height: 100 },
          },
        ],
      },
    ]);
    expect(placements.map((entry) => [entry.id, entry.worldX])).toEqual([
      ["first", 500],
      ["second", 724],
    ]);
  });

  it("cancels camera-scaled board transforms for zoomed boards", () => {
    const placements = layoutShaderAnchors([
      {
        origin: { x: 60, y: 0 },
        boardRect: { left: 37, top: 21, width: 1440 * 2.5, height: 900 * 2.5 },
        scale: 2.5,
        anchors: [
          {
            id: "zoomed",
            radius: 4,
            clientRect: {
              left: 37 + 100 * 2.5,
              top: 21 + 50 * 2.5,
              width: 200 * 2.5,
              height: 100 * 2.5,
            },
          },
        ],
      },
    ]);
    expect(placements).toEqual([
      {
        id: "zoomed",
        worldX: 160,
        worldY: 50,
        worldW: 200,
        worldH: 100,
        radius: 4,
      },
    ]);
  });
});

describe("collectShaderBoards", () => {
  it("reads layout rects instead of the source x/y attributes", () => {
    const board = document.createElement("section");
    board.className = "board";
    const nested = document.createElement("div");
    const anchor = document.createElement("div");
    anchor.dataset.ombriqueShader = "";
    anchor.dataset.shaderId = "nested";
    anchor.dataset.shaderX = "10";
    anchor.dataset.shaderY = "20";
    anchor.dataset.shaderWidth = "80";
    anchor.dataset.shaderHeight = "40";
    anchor.dataset.shaderRadius = "12";
    nested.appendChild(anchor);
    board.appendChild(nested);
    stubRect(board, 100, 50, 1440, 900);
    stubRect(anchor, 210, 170, 80, 40);

    const boards = collectShaderBoards(
      [{ element: board }],
      () => ({ x: 0, y: 0 }),
      () => 1,
    );
    const boardLayout = boards[0];
    if (!boardLayout) throw new Error("missing board layout");
    const anchorLayout = boardLayout.anchors[0];
    if (!anchorLayout) throw new Error("missing anchor layout");
    expect(anchorLayout.id).toBe("nested");
    expect(anchorLayout.radius).toBe(12);
    expect(anchorLayout.clientRect.left).toBe(210);
    expect(anchorLayout.clientRect.top).toBe(170);
    expect(anchorLayout.clientRect.width).toBe(80);
    expect(anchorLayout.clientRect.height).toBe(40);
    const placements = layoutShaderAnchors([boardLayout]);
    expect(placements).toEqual([
      {
        id: "nested",
        worldX: 110,
        worldY: 120,
        worldW: 80,
        worldH: 40,
        radius: 12,
      },
    ]);
  });
});
