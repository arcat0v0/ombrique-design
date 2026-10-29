import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationMenu, type ApplicationMenuProps } from "./ApplicationMenu";

afterEach(cleanup);

function renderMenu(overrides: Partial<ApplicationMenuProps> = {}) {
  const callbacks = {
    onOpenProject: vi.fn(),
    onOpenExample: vi.fn(),
    onExport: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDeleteSelection: vi.fn(),
    onZoomTo: vi.fn(),
    onZoomToFit: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onToggleDevtools: vi.fn(),
    onReloadRenderer: vi.fn(),
    onMinimizeWindow: vi.fn(),
    onToggleWindowMaximize: vi.fn(),
    onCloseWindow: vi.fn(),
  };
  const rendered = render(
    <ApplicationMenu
      canUndo={true}
      canRedo={true}
      canDelete={true}
      zoom={1}
      {...callbacks}
      {...overrides}
    />,
  );
  return { ...rendered, callbacks };
}

async function openMenu(baseElement: HTMLElement) {
  const trigger = within(baseElement).getByRole("button", {
    name: "Ombrique 应用菜单",
  });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return within(baseElement).findByRole("menu");
}

describe("ApplicationMenu", () => {
  it("opens from the brand button with grouped actions and kbd hints", async () => {
    const { baseElement } = renderMenu();
    const menu = await openMenu(baseElement);

    for (const label of ["文件", "编辑", "视图", "窗口"]) {
      expect(within(menu).getByText(label)).toBeDefined();
    }
    for (const shortcut of ["Ctrl+Z", "Ctrl+Shift+Z", "Delete"]) {
      expect(within(menu).getByText(shortcut).tagName).toBe("KBD");
    }
  });

  it("invokes every wired non-zoom action", async () => {
    const { baseElement, callbacks } = renderMenu();
    const cases = [
      ["打开项目", "onOpenProject"],
      ["打开示例项目", "onOpenExample"],
      ["导出 PNG", "onExport"],
      ["撤销", "onUndo"],
      ["重做", "onRedo"],
      ["删除所选", "onDeleteSelection"],
      ["适应画布", "onZoomToFit"],
      ["全屏", "onToggleFullscreen"],
      ["开发者工具", "onToggleDevtools"],
      ["重新加载", "onReloadRenderer"],
      ["最小化", "onMinimizeWindow"],
      ["最大化/还原", "onToggleWindowMaximize"],
      ["关闭", "onCloseWindow"],
    ] as const;

    for (const [label, callback] of cases) {
      const menu = await openMenu(baseElement);
      fireEvent.click(within(menu).getByText(label));
      expect(callbacks[callback]).toHaveBeenCalledTimes(1);
    }
  });

  it("uses the existing zoom action for zoom in, zoom out and 100%", async () => {
    const { baseElement, callbacks } = renderMenu();

    for (const label of ["放大", "缩小", "100%"]) {
      const menu = await openMenu(baseElement);
      fireEvent.click(within(menu).getByText(label));
    }

    expect(callbacks.onZoomTo.mock.calls).toEqual([[1.25], [0.8], [1]]);
  });

  it("disables unavailable actions and hides an unavailable example action", async () => {
    const { baseElement, callbacks } = renderMenu({
      canUndo: false,
      canRedo: false,
      canDelete: false,
      onOpenExample: undefined,
      onZoomTo: undefined,
      onToggleFullscreen: undefined,
      onToggleDevtools: undefined,
      onReloadRenderer: undefined,
      onMinimizeWindow: undefined,
      onToggleWindowMaximize: undefined,
      onCloseWindow: undefined,
    });
    const menu = await openMenu(baseElement);

    for (const label of [
      "撤销",
      "重做",
      "删除所选",
      "放大",
      "缩小",
      "100%",
      "全屏",
      "开发者工具",
      "重新加载",
      "最小化",
      "最大化/还原",
      "关闭",
    ]) {
      const item = within(menu).getByText(label).closest("[role=menuitem]");
      expect(item?.getAttribute("aria-disabled")).toBe("true");
      if (item) fireEvent.click(item);
    }

    expect(within(menu).queryByText("打开示例项目")).toBeNull();
    expect(callbacks.onUndo).not.toHaveBeenCalled();
    expect(callbacks.onRedo).not.toHaveBeenCalled();
    expect(callbacks.onDeleteSelection).not.toHaveBeenCalled();
    expect(callbacks.onZoomTo).not.toHaveBeenCalled();
  });
});
