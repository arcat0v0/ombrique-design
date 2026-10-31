interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BoardReference {
  rect: ClientRectLike;
  origin: { x: number; y: number };
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function worldRectFromClientRect(
  element: ClientRectLike,
  board: BoardReference,
  zoom: number,
): WorldRect {
  const scale = zoom === 0 ? 1 : zoom;
  return {
    x: board.origin.x + (element.left - board.rect.left) / scale,
    y: board.origin.y + (element.top - board.rect.top) / scale,
    width: element.width / scale,
    height: element.height / scale,
  };
}
