import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Frame } from "./Frame";

afterEach(cleanup);

describe("Frame", () => {
  it("renders a section sized to width/height", () => {
    const { container } = render(
      <Frame name="hero" width={400} height={300} />,
    );
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("data-name")).toBe("hero");
    expect(section?.style.width).toBe("400px");
    expect(section?.style.height).toBe("300px");
    expect(section?.style.position).toBe("relative");
  });

  it("applies free layout by default without flex", () => {
    const { container } = render(<Frame width={100} height={100} />);
    const section = container.querySelector("section");
    expect(section?.style.display).toBe("");
  });

  it("applies vertical flex layout with gap and padding", () => {
    const { container } = render(
      <Frame width={100} height={100} layout="vertical" gap={8} padding={16} />,
    );
    const section = container.querySelector("section");
    expect(section?.style.display).toBe("flex");
    expect(section?.style.flexDirection).toBe("column");
    expect(section?.style.gap).toBe("8px");
    expect(section?.style.padding).toBe("16px");
  });

  it("applies horizontal flex layout", () => {
    const { container } = render(
      <Frame width={100} height={100} layout="horizontal" gap={4} />,
    );
    const section = container.querySelector("section");
    expect(section?.style.flexDirection).toBe("row");
    expect(section?.style.gap).toBe("4px");
  });

  it("maps fill and radius to background and borderRadius", () => {
    const { container } = render(
      <Frame width={100} height={100} fill="#fff" radius={12} />,
    );
    const section = container.querySelector("section");
    expect(section?.style.background).toBe("rgb(255, 255, 255)");
    expect(section?.style.borderRadius).toBe("12px");
  });

  it("lets user style override derived styles", () => {
    const { container } = render(
      <Frame
        width={100}
        height={100}
        fill="#fff"
        style={{ background: "rgb(1, 2, 3)" }}
      />,
    );
    const section = container.querySelector("section");
    expect(section?.style.background).toBe("rgb(1, 2, 3)");
  });

  it("offsets by x/y and passes className", () => {
    const { container } = render(
      <Frame width={100} height={100} x={10} y={20} className="sheet" />,
    );
    const section = container.querySelector("section");
    expect(section?.style.left).toBe("10px");
    expect(section?.style.top).toBe("20px");
    expect(section?.className).toBe("sheet");
  });

  it("maps align/justify/wrap for auto-layout frames", () => {
    const { container } = render(
      <Frame
        width={100}
        height={100}
        layout="vertical"
        align="center"
        justify="space-between"
        wrap
      />,
    );
    const section = container.querySelector("section");
    expect(section?.style.alignItems).toBe("center");
    expect(section?.style.justifyContent).toBe("space-between");
    expect(section?.style.flexWrap).toBe("wrap");
  });

  it("maps grid layout props to display:grid", () => {
    const { container } = render(
      <Frame
        width={100}
        height={100}
        grid={{ columns: 3, rows: 2, gap: 12, padding: 8 }}
      />,
    );
    const section = container.querySelector("section");
    expect(section?.style.display).toBe("grid");
    expect(section?.style.gridTemplateColumns).toBe("repeat(3, 1fr)");
    expect(section?.style.gridTemplateRows).toBe("repeat(2, 1fr)");
    expect(section?.style.gap).toBe("12px");
    expect(section?.style.padding).toBe("8px");
  });

  it("keeps grid and flex mutually exclusive with flex taking priority", () => {
    const { container } = render(
      <Frame
        width={100}
        height={100}
        layout="horizontal"
        grid={{ columns: 2 }}
      />,
    );
    const section = container.querySelector("section");
    expect(section?.style.display).toBe("flex");
  });
});
