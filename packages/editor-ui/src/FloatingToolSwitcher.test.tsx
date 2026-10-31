import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FloatingToolSwitcher } from "./FloatingToolSwitcher";

afterEach(cleanup);

describe("FloatingToolSwitcher", () => {
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
      ["评论", "comment"],
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
});
