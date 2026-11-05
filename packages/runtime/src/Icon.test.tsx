import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Icon } from "./Icon";
import { encodeIconNodes } from "./icon-codec";
import { registerIconSet, unregisterIconSet } from "./icon-registry";

afterEach(cleanup);

describe("Icon", () => {
  it("renders the icon geometry inside an inline svg with the set viewBox", () => {
    const { container } = render(
      <Icon name="icon" iconName="alarm-clock" width={48} height={48} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("width")).toBe("48");
    expect(svg?.getAttribute("height")).toBe("48");
    expect(svg?.getAttribute("data-primitive")).toBe("icon");
    expect(svg?.getAttribute("data-icon-set")).toBe("lucide");
    expect(svg?.getAttribute("data-icon-name")).toBe("alarm-clock");
    expect(svg?.getAttribute("data-name")).toBe("icon");
    const paths = svg?.querySelectorAll("path");
    expect(paths?.length).toBe(5);
    expect(paths?.[0]?.getAttribute("d")).toBe("M12 9v4l2 2");
    const circle = svg?.querySelector("circle");
    expect(circle?.getAttribute("cx")).toBe("12");
    expect(circle?.getAttribute("cy")).toBe("13");
    expect(circle?.getAttribute("r")).toBe("8");
    expect(svg?.querySelector("title")?.textContent).toBe("icon");
  });

  it("defaults stroke kind painting and honours strokeWidth", () => {
    const { container } = render(
      <Icon iconName="circle" width={32} height={32} fill="#ff3366" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("stroke")).toBe("#ff3366");
    expect(svg?.getAttribute("stroke-width")).toBe("2");
    expect(svg?.getAttribute("color")).toBe("#ff3366");
  });

  it("applies an explicit strokeWidth override", () => {
    const { container } = render(
      <Icon
        iconName="circle"
        width={32}
        height={32}
        fill="#000000"
        strokeWidth={1.5}
      />,
    );
    expect(container.querySelector("svg")?.getAttribute("stroke-width")).toBe(
      "1.5",
    );
  });

  it("renders fill kind icons as filled shapes", () => {
    registerIconSet({
      name: "test-fill",
      kind: "fill",
      viewBox: "0 0 24 24",
      defaultStrokeWidth: 2,
      icons: {
        star: encodeIconNodes([
          { tag: "polygon", attrs: { points: "12 2 22 22 2 22" } },
        ]),
      },
      aliases: {},
    });
    const { container } = render(
      <Icon
        iconSet="test-fill"
        iconName="star"
        width={24}
        height={24}
        fill="#ff0000"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("#ff0000");
    expect(svg?.getAttribute("stroke")).toBe(null);
    expect(svg?.querySelector("polygon")).not.toBeNull();
    unregisterIconSet("test-fill");
  });

  it("reports an unknown icon name instead of rendering blank", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <Icon iconName="not-a-real-icon" width={24} height={24} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-icon-missing")).toBe(
      "lucide/not-a-real-icon",
    );
    expect(svg?.getAttribute("data-icon-name")).toBe("not-a-real-icon");
    expect(svg?.querySelector("rect")).not.toBeNull();
    expect(svg?.querySelector("text")?.textContent).toBe("?");
    expect(svg?.querySelector("title")?.textContent).toContain(
      'unknown icon "not-a-real-icon" in icon set "lucide"',
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("reports an unknown icon set with the known sets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <Icon iconSet="nope" iconName="house" width={24} height={24} />,
    );
    const title = container.querySelector("title")?.textContent ?? "";
    expect(title).toContain('unknown icon set "nope"');
    expect(title).toContain("known sets: lucide");
    warn.mockRestore();
  });

  it("resolves aliases to their canonical name", () => {
    const { container } = render(
      <Icon iconName="alarm-check" width={24} height={24} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-icon-name")).toBe("alarm-clock-check");
    expect(svg?.getAttribute("data-icon-missing")).toBe(null);
  });

  it("keeps data-name independent of icon identity", () => {
    const { container } = render(
      <Icon data-name="explicit" iconName="circle" width={24} height={24} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-name")).toBe("explicit");
    expect(svg?.getAttribute("data-icon-name")).toBe("circle");
  });

  it("applies positioning styles like other primitives", () => {
    const { container } = render(
      <Icon iconName="circle" x={12} y={30} width={24} height={24} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.style.position).toBe("absolute");
    expect(svg?.style.left).toBe("12px");
    expect(svg?.style.top).toBe("30px");
  });

  it("applies opacity", () => {
    const { container } = render(
      <Icon iconName="circle" width={24} height={24} opacity={0.5} />,
    );
    expect(container.querySelector("svg")?.style.opacity).toBe("0.5");
  });
});
