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
  it("opens from the brand button with grouped actions", async () => {
    const { baseElement } = renderMenu();
    const menu = await openMenu(baseElement);

    for (const label of ["文件", "最近打开", "编辑", "视图", "窗口"]) {
      expect(within(menu).getByText(label)).toBeDefined();
    }
    expect(within(menu).getByText("打开本地项目")).toBeDefined();
    expect(within(menu).getByText("导出 PNG")).toBeDefined();
  });

  it("uses the existing zoom action for zoom in, zoom out and 100%", async () => {
    const { baseElement, callbacks } = renderMenu();

    for (const label of ["放大", "缩小", "100%"]) {
      const menu = await openMenu(baseElement);
      fireEvent.click(within(menu).getByText(label));
    }

    expect(callbacks.onZoomTo.mock.calls).toEqual([[1.25], [0.8], [1]]);
  });

  it("lists recent projects and can return to the workspace", async () => {
    const onOpenRecentProject = vi.fn();
    const onShowWorkspace = vi.fn();
    const onCreateProject = vi.fn();
    const onOpenBundle = vi.fn();
    const { baseElement } = renderMenu({
      recentProjects: [
        {
          root: "/work/pricing-redesign",
          name: "pricing-redesign",
          lastOpenedAt: new Date().toISOString(),
          exists: true,
          thumbnail: null,
        },
        {
          root: "/work/archived",
          name: "archived",
          lastOpenedAt: new Date().toISOString(),
          exists: false,
          thumbnail: null,
        },
      ],
      onCreateProject,
      onOpenBundle,
      onOpenRecentProject,
      onShowWorkspace,
    });

    const menu = await openMenu(baseElement);
    expect(within(menu).getByText("新建项目")).toBeDefined();
    expect(within(menu).getByText("打开 .ombrique 项目包")).toBeDefined();

    fireEvent.click(within(menu).getByText("pricing-redesign"));
    expect(onOpenRecentProject).toHaveBeenCalledWith("/work/pricing-redesign");

    const secondMenu = await openMenu(baseElement);
    const archived = within(secondMenu)
      .getByText("archived")
      .closest("[role=menuitem]");
    expect(archived?.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(within(secondMenu).getByText("返回工作区"));
    expect(onShowWorkspace).toHaveBeenCalledTimes(1);
    expect(onCreateProject).toHaveBeenCalledTimes(0);
    expect(onOpenBundle).toHaveBeenCalledTimes(0);
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
