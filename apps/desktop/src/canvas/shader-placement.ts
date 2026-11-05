import type { ShaderAnchorPlacement } from "@ombrique/canvas";
import { worldRectFromClientRect } from "./selection-geometry";

export interface ShaderAnchorRect {
  id: string;
  radius: number;
  clientRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface ShaderBoardLayout {
  origin: { x: number; y: number };
  boardRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  scale: number;
  anchors: ShaderAnchorRect[];
}

export function collectShaderBoards(
  boards: Iterable<{ element: HTMLElement }>,
  originOf: (element: Element) => { x: number; y: number },
  scaleOf: (element: HTMLElement) => number,
): ShaderBoardLayout[] {
  const out: ShaderBoardLayout[] = [];
  for (const board of boards) {
    const anchors: ShaderAnchorRect[] = [];
    for (const anchor of board.element.querySelectorAll<HTMLElement>(
      "[data-ombrique-shader]",
    )) {
      const id = anchor.dataset.shaderId;
      if (!id) continue;
      anchors.push({
        id,
        radius: Number(anchor.dataset.shaderRadius ?? 0),
        clientRect: anchor.getBoundingClientRect(),
      });
    }
    out.push({
      origin: originOf(board.element),
      boardRect: board.element.getBoundingClientRect(),
      scale: scaleOf(board.element),
      anchors,
    });
  }
  return out;
}

export function layoutShaderAnchors(
  boards: readonly ShaderBoardLayout[],
): ShaderAnchorPlacement[] {
  const out: ShaderAnchorPlacement[] = [];
  for (const board of boards) {
    for (const anchor of board.anchors) {
      const rect = worldRectFromClientRect(
        anchor.clientRect,
        { rect: board.boardRect, origin: board.origin },
        board.scale,
      );
      out.push({
        id: anchor.id,
        worldX: rect.x,
        worldY: rect.y,
        worldW: rect.width,
        worldH: rect.height,
        radius: anchor.radius,
      });
    }
  }
  return out;
}
