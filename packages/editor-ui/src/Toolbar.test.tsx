import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";

afterEach(cleanup);

function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  const callbacks = {
    onOpenProject: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onCreateNode: vi.fn(),
    onZoomToFit: vi.fn(),
    onExport: vi.fn(),
  };
  const props = {
    canUndo: false,
    canRedo: false,
    zoom: 1,
    stats: null,
    busy: false,
    ...callbacks,
    ...overrides,
  };
  const rendered = render(<Toolbar {...props} />);
  return { ...rendered, callbacks };
}

describe("Toolbar", () => {
  it("controls undo and redo button state and click callbacks", () => {
    const { getByLabelText, callbacks, rerender } = renderToolbar({
      canUndo: false,
      canRedo: false,
    });
    const undo = getByLabelText("撤销") as HTMLButtonElement;
    const redo = getByLabelText("重做") as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    rerender(
      <Toolbar
        canUndo={true}
        canRedo={true}
        zoom={1}
        stats={null}
        busy={false}
        onOpenProject={() => {}}
        onUndo={callbacks.onUndo}
        onRedo={callbacks.onRedo}
        onCreateNode={() => {}}
        onZoomToFit={() => {}}
        onExport={() => {}}
      />,
    );
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(false);
    undo.click();
    redo.click();
    expect(callbacks.onUndo).toHaveBeenCalledTimes(1);
    expect(callbacks.onRedo).toHaveBeenCalledTimes(1);
  });

  it("disables all buttons while busy", () => {
    const { getByLabelText } = renderToolbar({ busy: true, canUndo: true });
    expect((getByLabelText("打开项目") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByLabelText("撤销") as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText("插入Frame") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("calls onCreateNode with the right kind for each insert tool", () => {
    const { getByLabelText, callbacks } = renderToolbar();
    const cases: Array<[string, string]> = [
      ["插入Frame", "frame"],
      ["插入矩形", "rect"],
      ["椭圆", "ellipse"],
      ["星形", "star"],
      ["文字", "text"],
    ];
    for (const [label, kind] of cases) {
      const btn = getByLabelText(new RegExp(label));
      btn.click();
      expect(callbacks.onCreateNode).toHaveBeenCalledWith(kind);
    }
    expect(callbacks.onCreateNode).toHaveBeenCalledTimes(5);
  });

  it("displays zoom as a percentage, stats, and fits on demand", () => {
    const { getByLabelText, getByTitle, callbacks } = renderToolbar({
      zoom: 1.5,
      stats: { fps: 60, visible: 12, uploads: 3, paints: 9 },
    });
    expect(getByTitle("缩放比例").textContent).toBe("150%");
    const stats = getByTitle("画布统计");
    expect(stats.textContent).toContain("60 FPS");
    expect(stats.textContent).toContain("可见 12");
    getByLabelText("适应画布").click();
    expect(callbacks.onZoomToFit).toHaveBeenCalledTimes(1);
  });

  it("controls Group and Ungroup button disabled state and click callbacks", () => {
    const onGroupSelection = vi.fn();
    const onUngroupSelection = vi.fn();

    const { getByLabelText, rerender } = renderToolbar({
      canGroup: false,
      canUngroup: false,
      onGroupSelection,
      onUngroupSelection,
    });

    const groupBtn = getByLabelText("编组") as HTMLButtonElement;
    const ungroupBtn = getByLabelText("解组") as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(true);
    expect(ungroupBtn.disabled).toBe(true);

    rerender(
      <Toolbar
        canUndo={false}
        canRedo={false}
        zoom={1}
        stats={null}
        busy={false}
        canGroup={true}
        canUngroup={true}
        onGroupSelection={onGroupSelection}
        onUngroupSelection={onUngroupSelection}
        onOpenProject={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onCreateNode={() => {}}
        onZoomToFit={() => {}}
        onExport={() => {}}
      />,
    );

    expect(groupBtn.disabled).toBe(false);
    expect(ungroupBtn.disabled).toBe(false);

    groupBtn.click();
    expect(onGroupSelection).toHaveBeenCalled();

    ungroupBtn.click();
    expect(onUngroupSelection).toHaveBeenCalled();
  });

  it("controls createComponent button and submits component name via dialog", async () => {
    const onCreateComponent = vi.fn();

    const { getByLabelText, getByText, findByLabelText, rerender } =
      renderToolbar({
        canCreateComponent: false,
        createDisabledReason: "根级 Frame 不能创建为组件",
        onCreateComponent,
      });

    const btn = getByLabelText("创建组件") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    rerender(
      <Toolbar
        canUndo={false}
        canRedo={false}
        zoom={1}
        stats={null}
        busy={false}
        canCreateComponent={true}
        createComponentNameDefault="CardItem"
        onCreateComponent={onCreateComponent}
        onOpenProject={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onCreateNode={() => {}}
        onZoomToFit={() => {}}
        onExport={() => {}}
      />,
    );

    expect(btn.disabled).toBe(false);
    btn.click();

    const input = (await findByLabelText("组件名称")) as HTMLInputElement;
    expect(input.value).toBe("CardItem");

    const createBtn = getByText("创建");
    createBtn.click();

    expect(onCreateComponent).toHaveBeenCalledWith("CardItem");
  });

  it("supports open and export project menu items", async () => {
    const onOpenProject = vi.fn();
    const onOpenBundle = vi.fn();
    const onExport = vi.fn();
    const onBundleProject = vi.fn();

    const { getByLabelText, findByText } = renderToolbar({
      onOpenProject,
      onOpenBundle,
      onExport,
      onBundleProject,
    });

    const openMenuBtn = getByLabelText("打开项目");
    fireEvent.pointerDown(openMenuBtn, { button: 0 });
    fireEvent.click(await findByText("打开本地项目目录"));
    expect(onOpenProject).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(openMenuBtn, { button: 0 });
    fireEvent.click(await findByText("打开 .ombrique 安装包"));
    expect(onOpenBundle).toHaveBeenCalledTimes(1);

    const exportMenuBtn = getByLabelText("导出");
    fireEvent.pointerDown(exportMenuBtn, { button: 0 });
    fireEvent.click(await findByText("导出当前画板 PNG"));
    expect(onExport).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(exportMenuBtn, { button: 0 });
    fireEvent.click(await findByText("打包项目为 .ombrique"));
    expect(onBundleProject).toHaveBeenCalledTimes(1);
  });

  it("renders zoom presets dropdown and prototype mode toggle", async () => {
    const onZoomTo = vi.fn();
    const onTogglePrototypeMode = vi.fn();
    const { getByLabelText, findByText, rerender } = renderToolbar({
      zoom: 1.5,
      prototypeMode: false,
      onZoomTo,
      onTogglePrototypeMode,
    });

    const zoomTrigger = getByLabelText("缩放比例");
    expect(zoomTrigger.textContent).toContain("150%");
    fireEvent.pointerDown(zoomTrigger, { button: 0 });
    fireEvent.click(await findByText("100%"));
    expect(onZoomTo).toHaveBeenCalledWith(1);

    const playBtn = getByLabelText("原型预览");
    fireEvent.click(playBtn);
    expect(onTogglePrototypeMode).toHaveBeenCalledTimes(1);

    rerender(
      <Toolbar
        canUndo={false}
        canRedo={false}
        zoom={1}
        stats={null}
        busy={false}
        onOpenProject={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onCreateNode={() => {}}
        onZoomToFit={() => {}}
        onExport={() => {}}
        prototypeMode={true}
        onTogglePrototypeMode={onTogglePrototypeMode}
      />,
    );
    expect(getByLabelText("退出预览")).toBeDefined();
  });
});
