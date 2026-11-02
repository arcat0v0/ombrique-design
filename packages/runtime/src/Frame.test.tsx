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

  it("keeps hidden effective even with flex layout", () => {
    const { container } = render(
      <Frame width={100} height={100} layout="vertical" hidden />,
    );
    const section = container.querySelector("section");
    expect(section?.hidden).toBe(true);
    expect(section?.style.display).toBe("none");
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

  it("renders prototype interaction attributes to data-prototype-*", () => {
    const { container } = render(
      <Frame
        width={100}
        height={100}
        onClickNavigate="page-settings"
        cursor="pointer"
        transitionType="slide-left"
        transitionDuration={350}
        onHoverStyle={{ opacity: 0.8 }}
      />,
    );
    const section = container.querySelector("section");
    expect(section?.getAttribute("data-prototype-navigate")).toBe(
      "page-settings",
    );
    expect(section?.getAttribute("data-prototype-cursor")).toBe("pointer");
    expect(section?.getAttribute("data-prototype-transition")).toBe(
      "slide-left",
    );
    expect(section?.getAttribute("data-prototype-duration")).toBe("350");
    expect(section?.getAttribute("data-prototype-hover")).toBe(
      '{"opacity":0.8}',
    );
  });

  it("renders mode as data-mode on the frame wrapping its descendants", () => {
    const { container } = render(
      <Frame width={100} height={100} mode="dark">
        <span data-testid="child">x</span>
      </Frame>,
    );
    const section = container.querySelector("section");
    expect(section?.getAttribute("data-mode")).toBe("dark");
    const child = container.querySelector('[data-testid="child"]');
    expect(child?.closest('[data-mode="dark"]')).toBe(section);
  });

  it("absolutely positions nested frames inside a free-layout frame", () => {
    const { container } = render(
      <Frame width={400} height={400}>
        <Frame data-testid="a" x={10} y={20} width={100} height={50} />
        <Frame data-testid="b" x={30} y={40} width={100} height={50} />
      </Frame>,
    );
    const root = container.querySelector("section");
    expect(root?.style.position).toBe("relative");
    for (const [id, left, top] of [
      ["a", "10px", "20px"],
      ["b", "30px", "40px"],
    ]) {
      const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      expect(el?.style.position).toBe("absolute");
      expect(el?.style.left).toBe(left);
      expect(el?.style.top).toBe(top);
    }
  });

  it("keeps nested frames in flow inside auto-layout and grid frames", () => {
    const { container } = render(
      <Frame width={400} height={400} layout="vertical">
        <Frame data-testid="flex-child" width={100} height={50}>
          <Frame data-testid="free-grandchild" x={5} y={6} width={10} height={10} />
        </Frame>
        <Frame width={100} height={100} grid={{ columns: 2 }}>
          <Frame data-testid="grid-child" width={10} height={10} />
        </Frame>
      </Frame>,
    );
    const style = (id: string) =>
      container.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.style;
    expect(style("flex-child")?.position).toBe("relative");
    expect(style("grid-child")?.position).toBe("relative");
    expect(style("free-grandchild")?.position).toBe("absolute");
  });
});
