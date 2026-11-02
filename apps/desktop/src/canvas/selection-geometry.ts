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

export function resolveParentOrigin(
  element: Element,
  boardOrigin: { x: number; y: number },
  rectFn: (el: Element) => WorldRect,
): { x: number; y: number } {
  const board = element.closest<HTMLElement>(".board");
  if (!board) return { x: 0, y: 0 };
  const parent = element.parentElement;
  if (!parent || parent === board) {
    return boardOrigin;
  }
  const parentRect = rectFn(parent);
  return { x: parentRect.x, y: parentRect.y };
}
