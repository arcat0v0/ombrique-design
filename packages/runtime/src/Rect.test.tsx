import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Ellipse } from "./Ellipse";
import { Rect } from "./Rect";

afterEach(cleanup);

describe("Rect", () => {
  it("renders an absolutely positioned filled box", () => {
    const { container } = render(
      <Rect
        name="card"
        x={10}
        y={20}
        width={120}
        height={80}
        fill="#ff0000"
        radius={8}
        opacity={0.5}
      />,
    );
    const div = container.querySelector("div");
    expect(div).not.toBeNull();
    expect(div?.getAttribute("data-name")).toBe("card");
    expect(div?.style.position).toBe("absolute");
    expect(div?.style.left).toBe("10px");
    expect(div?.style.top).toBe("20px");
    expect(div?.style.width).toBe("120px");
    expect(div?.style.background).toBe("rgb(255, 0, 0)");
  });
});

describe("Ellipse", () => {
  it("renders a circle-boundaried filled box", () => {
    const { container } = render(
      <Ellipse name="dot" x={5} y={6} width={40} height={40} fill="#00ff00" />,
    );
    const div = container.querySelector("div");
    expect(div?.style.borderRadius).toBe("50%");
    expect(div?.style.background).toBe("rgb(0, 255, 0)");
    expect(div?.style.width).toBe("40px");
    expect(div?.style.height).toBe("40px");
    expect(div?.style.position).toBe("absolute");
  });
});
