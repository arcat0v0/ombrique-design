import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSelection } from "./fixtures";
import { PropertiesPanel } from "./PropertiesPanel";

afterEach(cleanup);

describe("PropertiesPanel", () => {
  it("shows an empty state when nothing is selected", () => {
    const { getByText, queryByLabelText } = render(
      <PropertiesPanel
        selection={null}
        onSetStyle={() => {}}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );
    expect(getByText("未选择图层")).toBeDefined();
    expect(queryByLabelText("名称")).toBeNull();
  });

  it("shows read-only reason and disables inputs when selection is not editable", () => {
    const selection = makeSelection({
      editable: false,
      readOnlyReason: "代码生成的图层不可编辑",
      styles: [
        { key: "width", value: "100px", source: "inline", readOnly: false },
        { key: "left", value: "20px", source: "inline", readOnly: false },
      ],
      text: "hello",
    });
    const { getByText, getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={() => {}}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );
    expect(getByText("代码生成的图层不可编辑")).toBeDefined();
    expect((getByLabelText("名称") as HTMLInputElement).disabled).toBe(true);
    expect((getByLabelText("文本内容") as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect((getByLabelText("X 坐标值") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((getByLabelText("W 坐标值") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((getByLabelText("切换显隐") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByLabelText("切换锁定") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("edits Geometry X, Y, W, H with Enter, blur, and supports Esc revert", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      styles: [
        { key: "left", value: "10", source: "inline", readOnly: false },
        { key: "top", value: "20", source: "inline", readOnly: false },
        { key: "width", value: "100", source: "inline", readOnly: false },
        { key: "height", value: "50", source: "inline", readOnly: false },
      ],
    });
    const { getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    const xInput = getByLabelText("X 坐标值") as HTMLInputElement;
    const yInput = getByLabelText("Y 坐标值") as HTMLInputElement;
    const wInput = getByLabelText("W 坐标值") as HTMLInputElement;
    const hInput = getByLabelText("H 坐标值") as HTMLInputElement;

    expect(xInput.value).toBe("10");
    expect(yInput.value).toBe("20");
    expect(wInput.value).toBe("100");
    expect(hInput.value).toBe("50");

    fireEvent.change(xInput, { target: { value: "35" } });
    fireEvent.keyDown(xInput, { key: "Enter" });
    expect(onSetStyle).toHaveBeenCalledWith("left", 35);

    fireEvent.change(wInput, { target: { value: "240" } });
    fireEvent.blur(wInput);
    expect(onSetStyle).toHaveBeenCalledWith("width", 240);

    fireEvent.change(hInput, { target: { value: "999" } });
    fireEvent.keyDown(hInput, { key: "Escape" });
    expect(hInput.value).toBe("50");

    fireEvent.change(yInput, { target: { value: "   " } });
    fireEvent.blur(yInput);
    expect(onSetStyle).toHaveBeenCalledWith("top", null);
  });

  it("renders constraint section with CSS mappings when positioned absolutely", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      styles: [
        {
          key: "position",
          value: "absolute",
          source: "inline",
          readOnly: false,
        },
        { key: "left", value: "10px", source: "inline", readOnly: false },
        { key: "top", value: "20px", source: "inline", readOnly: false },
        { key: "width", value: "200px", source: "inline", readOnly: false },
        { key: "height", value: "100px", source: "inline", readOnly: false },
      ],
    });
    const { getByText, getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect(getByText("Constraint 约束")).toBeDefined();
    const leftBtn = getByLabelText("水平约束 left");
    const topBtn = getByLabelText("垂直约束 top");
    expect(leftBtn).toBeDefined();
    expect(topBtn).toBeDefined();

    fireEvent.click(leftBtn);
    expect(onSetStyle).toHaveBeenCalledWith("left", 0);
    expect(onSetStyle).toHaveBeenCalledWith("right", "auto");

    fireEvent.click(topBtn);
    expect(onSetStyle).toHaveBeenCalledWith("top", 0);
    expect(onSetStyle).toHaveBeenCalledWith("bottom", null);
  });

  it("supports collapsing and expanding style groups", () => {
    const selection = makeSelection({
      styles: [
        { key: "display", value: "flex", source: "inline", readOnly: false },
        { key: "gap", value: "12px", source: "inline", readOnly: false },
      ],
    });
    const { getByText, queryByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={() => {}}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect(queryByLabelText("样式 display")).not.toBeNull();
    const layoutHeader = getByText("Layout 布局");
    fireEvent.click(layoutHeader);

    expect(queryByLabelText("样式 display")).toBeNull();

    fireEvent.click(layoutHeader);
    expect(queryByLabelText("样式 display")).not.toBeNull();
  });

  it("resets all fields when selection switches to a different layer", () => {
    const first = makeSelection({
      id: "layer-a",
      name: "Hero Title",
      text: "Original Text",
      styles: [
        { key: "width", value: "320px", source: "inline", readOnly: false },
        { key: "left", value: "40px", source: "inline", readOnly: false },
        { key: "color", value: "#ff0000", source: "token", readOnly: false },
      ],
    });
    const second = makeSelection({
      id: "layer-b",
      name: "Footer Link",
      text: "About Us",
      styles: [
        { key: "width", value: "120px", source: "inline", readOnly: false },
        { key: "left", value: "10px", source: "inline", readOnly: false },
        { key: "color", value: "#00ff00", source: "inline", readOnly: false },
      ],
    });

    const { rerender, getByLabelText } = render(
      <PropertiesPanel
        selection={first}
        onSetStyle={() => {}}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect((getByLabelText("名称") as HTMLInputElement).value).toBe(
      "Hero Title",
    );
    expect((getByLabelText("文本内容") as HTMLTextAreaElement).value).toBe(
      "Original Text",
    );
    expect((getByLabelText("W 坐标值") as HTMLInputElement).value).toBe(
      "320px",
    );
    expect((getByLabelText("X 坐标值") as HTMLInputElement).value).toBe("40px");
    expect((getByLabelText("样式 color") as HTMLInputElement).value).toBe(
      "#ff0000",
    );

    rerender(
      <PropertiesPanel
        selection={second}
        onSetStyle={() => {}}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect((getByLabelText("名称") as HTMLInputElement).value).toBe(
      "Footer Link",
    );
    expect((getByLabelText("文本内容") as HTMLTextAreaElement).value).toBe(
      "About Us",
    );
    expect((getByLabelText("W 坐标值") as HTMLInputElement).value).toBe(
      "120px",
    );
    expect((getByLabelText("X 坐标值") as HTMLInputElement).value).toBe("10px");
    expect((getByLabelText("样式 color") as HTMLInputElement).value).toBe(
      "#00ff00",
    );
  });

  it("shows Auto Layout section with existing keys for frame tags", () => {
    const selection = makeSelection({
      tag: "frame",
      styles: [
        { key: "display", value: "flex", source: "inline", readOnly: false },
        {
          key: "flexDirection",
          value: "column",
          source: "inline",
          readOnly: false,
        },
        { key: "gap", value: "12px", source: "inline", readOnly: false },
      ],
    });
    const { getByText, getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={() => {}}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect(getByText("Auto Layout 自动布局")).toBeDefined();
    expect((getByLabelText("Gap 间距") as HTMLInputElement).value).toBe("12px");
    expect(getByLabelText("对齐 flex-start")).toBeDefined();
    expect(getByLabelText("主轴 space-between")).toBeDefined();
    expect(getByLabelText("换行 wrap")).toBeDefined();
  });

  it("commits direction, align, and wrap as Frame props on <Frame>", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      tag: "frame",
      styles: [
        { key: "layout", value: "vertical", source: "inline", readOnly: false },
      ],
    });
    const { getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    fireEvent.click(getByLabelText("对齐 center"));
    expect(onSetStyle).toHaveBeenCalledWith("align", "center");

    fireEvent.click(getByLabelText("换行 wrap"));
    expect(onSetStyle).toHaveBeenCalledWith("wrap", true);

    fireEvent.click(getByLabelText("主轴 center"));
    expect(onSetStyle).toHaveBeenCalledWith("justify", "center");
  });

  it("passes target with file, spans and selector when editing shared styles", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      styles: [
        {
          key: "color",
          value: "#112233",
          source: "shared",
          readOnly: false,
          ruleLabel: "pages/home.tsx:.card",
          file: "pages/home.tsx",
          start: 120,
          end: 127,
          selector: ".card",
          sourceId: "pages/home.tsx#.card",
        },
      ],
    });
    const { getByText, getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect(getByText("共享样式")).toBeDefined();
    expect(getByText("pages/home.tsx:.card")).toBeDefined();

    const colorInput = getByLabelText("样式 color") as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#0066cc" } });
    fireEvent.blur(colorInput);

    expect(onSetStyle).toHaveBeenCalledWith("color", "#0066cc", {
      source: "shared",
      file: "pages/home.tsx",
      start: 120,
      end: 127,
      selector: ".card",
      sourceId: "pages/home.tsx#.card",
    });
  });

  it("deduplicates x/y/w/h and name from generic groups while keeping unknown keys editable", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      styles: [
        { key: "left", value: "20px", source: "inline", readOnly: false },
        { key: "top", value: "30px", source: "inline", readOnly: false },
        { key: "width", value: "400px", source: "inline", readOnly: false },
        { key: "height", value: "200px", source: "inline", readOnly: false },
        { key: "name", value: "CustomName", source: "inline", readOnly: false },
        {
          key: "customEffectFilter",
          value: "blur(4px)",
          source: "inline",
          readOnly: false,
        },
      ],
    });
    const { getByText, getByLabelText, queryByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    // Geometry dedicated controls exist
    expect((getByLabelText("X 坐标值") as HTMLInputElement).value).toBe("20px");
    expect((getByLabelText("W 坐标值") as HTMLInputElement).value).toBe(
      "400px",
    );

    // But generic style table does not repeat left, top, width, height, or name
    expect(queryByLabelText("样式 width")).toBeNull();
    expect(queryByLabelText("样式 left")).toBeNull();
    expect(queryByLabelText("样式 top")).toBeNull();
    expect(queryByLabelText("样式 height")).toBeNull();
    expect(queryByLabelText("样式 name")).toBeNull();

    // Unknown custom key is under Other group and editable
    expect(getByText("Other 属性")).toBeDefined();
    const customInput = getByLabelText(
      "样式 customEffectFilter",
    ) as HTMLInputElement;
    expect(customInput.value).toBe("blur(4px)");
    fireEvent.change(customInput, { target: { value: "blur(8px)" } });
    fireEvent.blur(customInput);
    expect(onSetStyle).toHaveBeenCalledWith("customEffectFilter", "blur(8px)", {
      source: "inline",
    });
  });

  it("binds design variable when token is selected from dropdown", async () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      styles: [
        {
          key: "color",
          value: "#000000",
          source: "inline",
          readOnly: false,
        },
      ],
    });
    const tokens = [
      { name: "--brand-blue", value: "#0066cc", category: "color" },
      { name: "--brand-green", value: "#10b981", category: "color" },
    ];

    const { getByLabelText, findByText } = render(
      <PropertiesPanel
        selection={selection}
        tokens={tokens}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    const bindBtn = getByLabelText("绑定设计变量至 color");
    fireEvent.pointerDown(bindBtn, { button: 0 });

    const tokenOption = await findByText("--brand-blue");
    fireEvent.click(tokenOption);

    expect(onSetStyle).toHaveBeenCalledWith("color", "var(--brand-blue)", {
      source: "token",
    });
  });

  it("renders component instance card when kind is component and calls onDetachInstance on confirm", () => {
    const onDetachInstance = vi.fn();
    const selection = makeSelection({
      name: "Header",
      componentName: "HeaderComponent",
      kind: "component",
      styles: [],
    });

    const { getByText, getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={() => {}}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
        onDetachInstance={onDetachInstance}
      />,
    );

    expect(getByText("HeaderComponent")).toBeDefined();
    expect(getByText("组件实例")).toBeDefined();
    expect(
      getByText("编辑此实例属性仅影响当前元素；双击将进入主组件源码。"),
    ).toBeDefined();

    const detachBtn = getByLabelText("分离实例");
    fireEvent.click(detachBtn);

    expect(getByText("确认分离组件实例？")).toBeDefined();
    const confirmBtn = getByText("确认分离");
    fireEvent.click(confirmBtn);

    expect(onDetachInstance).toHaveBeenCalledTimes(1);
  });

  it("renders variant axis dropdown controls and updates prop value via onSetAttrs", async () => {
    const onSetAttrs = vi.fn();
    const selection = makeSelection({
      name: "Button",
      componentName: "Button",
      kind: "component",
      styles: [],
      attrs: [{ key: "size", value: "medium" }],
      variantAxes: [{ name: "size", values: ["small", "medium", "large"] }],
      variantProps: { size: "medium" },
    });

    const { getByTestId, getByText, findByTestId } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={() => {}}
        onSetAttrs={onSetAttrs}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect(getByTestId("variant-controls")).toBeDefined();
    expect(getByText("变体属性")).toBeDefined();
    const trigger = getByTestId("variant-trigger-size");
    expect(trigger.textContent).toContain("medium");

    fireEvent.pointerDown(trigger, { button: 0 });
    const option = await findByTestId("variant-option-size-large");
    fireEvent.click(option);

    expect(onSetAttrs).toHaveBeenCalledWith({ size: "large" });
  });

  it("renders Image card for image tag and commits src, radius and opacity", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      name: "HeroPhoto",
      tag: "image",
      attrs: [{ key: "src", value: "assets/original.png" }],
      styles: [
        { key: "radius", value: "4", source: "inline", readOnly: false },
        { key: "opacity", value: "1", source: "inline", readOnly: false },
      ],
    });

    const { getByText, getByLabelText } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect(getByText("图片资源")).toBeDefined();

    const srcInput = getByLabelText("图片源路径") as HTMLInputElement;
    expect(srcInput.value).toBe("assets/original.png");
    fireEvent.change(srcInput, { target: { value: "assets/updated.png" } });
    fireEvent.blur(srcInput);
    expect(onSetStyle).toHaveBeenCalledWith("src", "assets/updated.png");

    const radiusInput = getByLabelText("圆角半径") as HTMLInputElement;
    fireEvent.change(radiusInput, { target: { value: "12px" } });
    fireEvent.blur(radiusInput);
    expect(onSetStyle).toHaveBeenCalledWith("radius", 12);

    const opacityInput = getByLabelText("图片透明度") as HTMLInputElement;
    fireEvent.change(opacityInput, { target: { value: "0.6" } });
    fireEvent.blur(opacityInput);
    expect(onSetStyle).toHaveBeenCalledWith("opacity", 0.6);
  });

  it("renders Boolean card for boolean tag and switches op and calls onFlattenSelection", () => {
    const onSetStyle = vi.fn();
    const onFlattenSelection = vi.fn();
    const selection = makeSelection({
      name: "CombinedShape",
      tag: "boolean",
      attrs: [{ key: "op", value: "union" }],
      styles: [],
    });

    const { getByText, getByLabelText, rerender } = render(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
        onFlattenSelection={onFlattenSelection}
      />,
    );

    expect(getByText("布尔运算")).toBeDefined();
    const unionBtn = getByLabelText("布尔运算 union");
    expect(unionBtn.getAttribute("aria-pressed")).toBe("true");

    const subtractBtn = getByLabelText("布尔运算 subtract");
    fireEvent.click(subtractBtn);
    expect(onSetStyle).toHaveBeenCalledWith("op", "subtract");

    const flattenBtn = getByLabelText("拼合矢量");
    expect((flattenBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(flattenBtn);
    expect(onFlattenSelection).toHaveBeenCalledTimes(1);

    rerender(
      <PropertiesPanel
        selection={selection}
        onSetStyle={onSetStyle}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    const disabledFlatten = getByLabelText("拼合矢量") as HTMLButtonElement;
    expect(disabledFlatten.disabled).toBe(true);
  });

  it("renders Prototype section when a Frame is selected and allows setting navigation", () => {
    const onSetAttrs = vi.fn();
    const onSetStyle = vi.fn();
    const frameSelection = makeSelection({
      name: "Card",
      tag: "Frame",
      styles: [
        { key: "width", value: "300", source: "inline", readOnly: false },
        { key: "height", value: "200", source: "inline", readOnly: false },
      ],
    });

    const pages = [
      { id: "page-home", name: "Home" },
      { id: "page-detail", name: "Detail" },
    ];

    const { getByText } = render(
      <PropertiesPanel
        selection={frameSelection}
        pages={pages}
        onSetStyle={onSetStyle}
        onSetAttrs={onSetAttrs}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );

    expect(getByText("交互原型 (Prototype)")).toBeDefined();
    expect(getByText("触发方式 (Trigger)")).toBeDefined();
    expect(getByText("动作 (Action)")).toBeDefined();
    expect(getByText("目标页面 (Destination)")).toBeDefined();
    expect(getByText("转场动画 (Transition)")).toBeDefined();
    expect(getByText("时长 (Duration ms)")).toBeDefined();
  });

  it("dispatches Frame mode through onSetAttrs and clears it for inherit", async () => {
    const onSetAttrs = vi.fn();
    const selection = makeSelection({
      name: "Card",
      tag: "Frame",
      styles: [
        { key: "width", value: "300", source: "inline", readOnly: false },
        { key: "mode", value: "dark", source: "inline", readOnly: false },
      ],
    });
    const tokenModes = [
      { name: "default", isDefault: true },
      { name: "dark", isDefault: false },
      { name: "compact", isDefault: false },
    ];
    const { getByTestId, findByTestId, queryByText } = render(
      <PropertiesPanel
        selection={selection}
        tokenModes={tokenModes}
        onSetStyle={() => {}}
        onSetAttrs={onSetAttrs}
        onSetText={() => {}}
        onSetName={() => {}}
        onToggleHidden={() => {}}
        onToggleLocked={() => {}}
      />,
    );
    const trigger = getByTestId("mode-trigger");
    expect(trigger.textContent).toContain("dark");
    expect(queryByText("mode")).toBeNull();

    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(await findByTestId("mode-option-compact"));
    expect(onSetAttrs).toHaveBeenCalledWith({ mode: "compact" });

    fireEvent.pointerDown(getByTestId("mode-trigger"), { button: 0 });
    fireEvent.click(await findByTestId("mode-option-inherit"));
    expect(onSetAttrs).toHaveBeenCalledWith({ mode: null });

    fireEvent.pointerDown(getByTestId("mode-trigger"), { button: 0 });
    fireEvent.click(await findByTestId("mode-option-default"));
    expect(onSetAttrs).toHaveBeenCalledWith({ mode: "default" });
  });
});
