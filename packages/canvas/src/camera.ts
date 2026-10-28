export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export function zoomAt(
  cam: Camera,
  factor: number,
  cx: number,
  cy: number,
  minZ: number,
  maxZ: number,
): Camera {
  const z = Math.min(maxZ, Math.max(minZ, cam.z * factor));
  if (z === cam.z) return cam;
  const wx = cam.x + cx / cam.z;
  const wy = cam.y + cy / cam.z;
  return { x: wx - cx / z, y: wy - cy / z, z };
}

export function screenToWorld(cam: Camera, sx: number, sy: number): Vec2 {
  return { x: cam.x + sx / cam.z, y: cam.y + sy / cam.z };
}

export function worldToScreen(cam: Camera, wx: number, wy: number): Vec2 {
  return { x: (wx - cam.x) * cam.z, y: (wy - cam.y) * cam.z };
}

export function visibleRect(
  cam: Camera,
  viewportW: number,
  viewportH: number,
): Rect {
  return { x: cam.x, y: cam.y, w: viewportW / cam.z, h: viewportH / cam.z };
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
  );
}
