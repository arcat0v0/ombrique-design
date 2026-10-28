export interface StarVertex {
  x: number;
  y: number;
}

export function starVertices(
  size: number,
  points = 5,
  ratio = 0.4,
): StarVertex[] {
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2;
  const inner = outer * ratio;
  const vertices: StarVertex[] = [];
  for (let k = 0; k < points * 2; k += 1) {
    const radius = k % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (k * Math.PI) / points;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return vertices;
}

export function starPoints(size: number, points = 5, ratio = 0.4): string {
  return starVertices(size, points, ratio)
    .map((v) => `${v.x},${v.y}`)
    .join(" ");
}
