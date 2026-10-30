import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FloatingToolSwitcher } from "./FloatingToolSwitcher";

afterEach(cleanup);

describe("FloatingToolSwitcher", () => {
  it("renders both tools with the active tool highlighted", () => {
    const onSelectTool = vi.fn();
    const { getByRole, getByLabelText } = render(
      <FloatingToolSwitcher activeTool="select" onSelectTool={onSelectTool} />,
    );
    const select = getByRole("radio", { name: "选择工具" });
    const hand = getByRole("radio", { name: "抓手工具" });

    expect(getByLabelText("画布工具").style.position).toBe("absolute");
    expect(select.getAttribute("aria-checked")).toBe("true");
    expect(hand.getAttribute("aria-checked")).toBe("false");
  });

  it("calls the real tool action and follows controlled active state", () => {
    const onSelectTool = vi.fn();
    const { getByRole, rerender } = render(
      <FloatingToolSwitcher activeTool="select" onSelectTool={onSelectTool} />,
    );

    getByRole("radio", { name: "抓手工具" }).click();
    expect(onSelectTool).toHaveBeenCalledWith("hand");

    rerender(
      <FloatingToolSwitcher activeTool="hand" onSelectTool={onSelectTool} />,
    );
    expect(
      getByRole("radio", { name: "抓手工具" }).getAttribute("aria-checked"),
    ).toBe("true");

    getByRole("radio", { name: "选择工具" }).click();
    expect(onSelectTool).toHaveBeenCalledWith("select");
    expect(onSelectTool).toHaveBeenCalledTimes(2);
  });

  it("selects creation tools and highlights the active shape", () => {
    const onSelectTool = vi.fn();
    const { getByRole, rerender } = render(
      <FloatingToolSwitcher activeTool="select" onSelectTool={onSelectTool} />,
    );
    for (const [name, tool] of [
      ["Frame", "frame"],
      ["矩形", "rect"],
      ["椭圆", "ellipse"],
      ["星形", "star"],
      ["文字", "text"],
    ] as const) {
      getByRole("radio", { name }).click();
      expect(onSelectTool).toHaveBeenCalledWith(tool);
    }
    rerender(
      <FloatingToolSwitcher activeTool="ellipse" onSelectTool={onSelectTool} />,
    );
    expect(
      getByRole("radio", { name: "椭圆" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("shows actual keyboard shortcuts as kbd hints", async () => {
    const onSelectTool = vi.fn();
    const { findByText, getByRole } = render(
      <FloatingToolSwitcher activeTool="select" onSelectTool={onSelectTool} />,
    );

    fireEvent.focus(getByRole("radio", { name: "选择工具" }));
    expect((await findByText("V")).tagName).toBe("KBD");

    fireEvent.focus(getByRole("radio", { name: "抓手工具" }));
    expect((await findByText("H")).tagName).toBe("KBD");
  });
});
