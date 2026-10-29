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
  it("disables undo and redo when canUndo and canRedo are false", () => {
    const { getByLabelText } = renderToolbar();
    const undo = getByLabelText("撤销") as HTMLButtonElement;
    const redo = getByLabelText("重做") as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
  });

  it("enables undo and redo when available and calls callbacks on click", () => {
    const { getByLabelText, callbacks } = renderToolbar({
      canUndo: true,
      canRedo: true,
    });
    const undo = getByLabelText("撤销") as HTMLButtonElement;
    const redo = getByLabelText("重做") as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(false);
    undo.click();
    redo.click();
    expect(callbacks.onUndo).toHaveBeenCalledTimes(1);
    expect(callbacks.onRedo).toHaveBeenCalledTimes(1);
  });

  it("shows kbd hints for actual toolbar keyboard shortcuts", async () => {
    const { findByText, getByLabelText } = renderToolbar({
      canUndo: true,
      canGroup: true,
    });

    fireEvent.focus(getByLabelText("撤销"));
    expect((await findByText("Ctrl+Z")).tagName).toBe("KBD");

    fireEvent.focus(getByLabelText("编组"));
    expect((await findByText("Ctrl+G")).tagName).toBe("KBD");
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
      ["插入椭圆", "ellipse"],
      ["插入星形", "star"],
      ["插入文字", "text"],
    ];
    for (const [label, kind] of cases) {
      getByLabelText(label).click();
      expect(callbacks.onCreateNode).toHaveBeenCalledWith(kind);
    }
    expect(callbacks.onCreateNode).toHaveBeenCalledTimes(5);
  });

  it("displays zoom as a percentage and fits on demand", () => {
    const { getByLabelText, getByTitle, callbacks } = renderToolbar({
      zoom: 1.5,
    });
    expect(getByTitle("缩放比例").textContent).toBe("150%");
    getByLabelText("适应画布").click();
    expect(callbacks.onZoomToFit).toHaveBeenCalledTimes(1);
  });

  it("shows fps and visible count when stats are provided", () => {
    const { getByTitle } = renderToolbar({
      stats: { fps: 60, visible: 12, uploads: 3, paints: 9 },
    });
    const stats = getByTitle("画布统计");
    expect(stats.textContent).toContain("60 FPS");
    expect(stats.textContent).toContain("可见 12");
  });

  it("hides stats when they are null", () => {
    const { queryByLabelText } = renderToolbar({ stats: null });
    expect(queryByLabelText("画布统计")).toBeNull();
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

  it("invokes onInsertImage when provided, or falls back to onCreateNode for image", () => {
    const onInsertImage = vi.fn();
    const onCreateNode = vi.fn();

    const { getByLabelText, rerender } = renderToolbar({
      onInsertImage,
      onCreateNode,
    });

    const imageBtn = getByLabelText("插入图片");
    imageBtn.click();

    expect(onInsertImage).toHaveBeenCalledTimes(1);
    expect(onCreateNode).not.toHaveBeenCalled();

    rerender(
      <Toolbar
        canUndo={false}
        canRedo={false}
        zoom={1}
        stats={null}
        busy={false}
        onCreateNode={onCreateNode}
        onOpenProject={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onZoomToFit={() => {}}
        onExport={() => {}}
      />,
    );

    imageBtn.click();
    expect(onCreateNode).toHaveBeenCalledWith("image");
  });

  it("controls Flatten button state and invokes onFlattenSelection", () => {
    const onFlattenSelection = vi.fn();
    const { getByLabelText, rerender } = renderToolbar({
      canFlatten: false,
      onFlattenSelection,
    });

    const flattenBtn = getByLabelText("拼合矢量") as HTMLButtonElement;
    expect(flattenBtn.disabled).toBe(true);

    rerender(
      <Toolbar
        canUndo={false}
        canRedo={false}
        zoom={1}
        stats={null}
        busy={false}
        canFlatten={true}
        onFlattenSelection={onFlattenSelection}
        onOpenProject={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onCreateNode={() => {}}
        onZoomToFit={() => {}}
        onExport={() => {}}
      />,
    );

    expect(flattenBtn.disabled).toBe(false);
    flattenBtn.click();
    expect(onFlattenSelection).toHaveBeenCalledTimes(1);
  });

  it("supports open project menu items: local folder and .ombrique bundle", async () => {
    const onOpenProject = vi.fn();
    const onOpenBundle = vi.fn();

    const { getByLabelText, findByText } = renderToolbar({
      onOpenProject,
      onOpenBundle,
    });

    const openMenuBtn = getByLabelText("打开项目");
    fireEvent.pointerDown(openMenuBtn, { button: 0 });

    const openLocalItem = await findByText("打开本地项目目录");
    fireEvent.click(openLocalItem);
    expect(onOpenProject).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(openMenuBtn, { button: 0 });
    const openBundleItem = await findByText("打开 .ombrique 安装包");
    fireEvent.click(openBundleItem);
    expect(onOpenBundle).toHaveBeenCalledTimes(1);
  });

  it("supports export menu items: export PNG and bundle project as .ombrique", async () => {
    const onExport = vi.fn();
    const onBundleProject = vi.fn();

    const { getByLabelText, findByText } = renderToolbar({
      onExport,
      onBundleProject,
    });

    const exportMenuBtn = getByLabelText("导出");
    fireEvent.pointerDown(exportMenuBtn, { button: 0 });

    const exportPngItem = await findByText("导出当前画板 PNG");
    fireEvent.click(exportPngItem);
    expect(onExport).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(exportMenuBtn, { button: 0 });
    const bundleItem = await findByText("打包项目为 .ombrique");
    fireEvent.click(bundleItem);
    expect(onBundleProject).toHaveBeenCalledTimes(1);
  });

  it("renders zoom presets dropdown and triggers onZoomTo", async () => {
    const onZoomTo = vi.fn();
    const { getByLabelText, findByText } = renderToolbar({
      zoom: 1.5,
      onZoomTo,
    });

    const zoomTrigger = getByLabelText("缩放比例");
    expect(zoomTrigger.textContent).toContain("150%");

    fireEvent.pointerDown(zoomTrigger, { button: 0 });
    const preset100 = await findByText("100%");
    fireEvent.click(preset100);

    expect(onZoomTo).toHaveBeenCalledWith(1);
  });
});
