import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Star } from "./Star";
import { starVertices } from "./starMath";

afterEach(cleanup);

describe("starVertices", () => {
  it("produces alternating outer/inner vertices, 2 per point", () => {
    const vertices = starVertices(100, 5, 0.4);
    expect(vertices).toHaveLength(10);
    const outer = 50;
    const inner = 20;
    vertices.forEach((v, k) => {
      const r = Math.hypot(v.x - 50, v.y - 50);
      expect(r).toBeCloseTo(k % 2 === 0 ? outer : inner);
    });
  });

  it("starts at the top center and stays within bounds", () => {
    const vertices = starVertices(100);
    expect(vertices[0]?.x).toBeCloseTo(50);
    expect(vertices[0]?.y).toBeCloseTo(0);
    for (const v of vertices) {
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(100);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(100);
    }
  });

  it("honors point count", () => {
    expect(starVertices(100, 6)).toHaveLength(12);
    expect(starVertices(100, 3)).toHaveLength(6);
  });
});

describe("Star", () => {
  it("renders an inline svg polygon with 2*points vertices", () => {
    const { container } = render(
      <Star
        name="badge"
        x={15}
        y={25}
        size={60}
        points={5}
        ratio={0.4}
        fill="#ffcc00"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("data-name")).toBe("badge");
    expect(svg?.style.position).toBe("absolute");
    expect(svg?.style.left).toBe("15px");
    expect(svg?.style.top).toBe("25px");
    expect(svg?.getAttribute("width")).toBe("60");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 60 60");
    const polygon = container.querySelector("polygon");
    expect(polygon?.getAttribute("fill")).toBe("#ffcc00");
    expect(polygon?.getAttribute("points")?.split(" ")).toHaveLength(10);
  });
});
