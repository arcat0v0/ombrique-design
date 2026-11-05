import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenModeNameSchema } from "@ombrique/protocol";
import { TokensPanel, encodeTokenCellRef } from "./TokensPanel";
import type {
  TokenAxisSelector,
  TokenCellItem,
  TokenItem,
  TokenModeItem,
} from "./types";

afterEach(cleanup);

const SAMPLE_TOKENS: TokenItem[] = [
  { name: "--color-primary", value: "#2f6bff", category: "color" },
  { name: "--space-2", value: "8px", category: "spacing" },
  { name: "--radius-md", value: "10px", category: "radius" },
];

const MODES: TokenModeItem[] = [
  { name: "Light", isDefault: true },
  { name: "Dark", isDefault: false },
];

const MODE_TOKENS: TokenItem[] = [
  {
    name: "--color-primary",
    value: "#2f6bff",
    category: "color",
    values: { Light: "#2f6bff", Dark: "#9db8ff" },
  },
  {
    name: "--space-2",
    value: "8px",
    category: "spacing",
    values: { Light: "8px" },
  },
];

function makeCell(
  value: string,
  selectors: TokenAxisSelector[],
  order: number,
  isDefault = false,
): TokenCellItem {
  return {
    value,
    selectors,
    order,
    ruleIndex: order,
    specificity: selectors.length + (isDefault ? 1 : 0),
    isDefault,
  };
}

const MULTI_AXIS_TOKENS: TokenItem[] = [
  {
    name: "--bg",
    value: "white",
    cells: [
      makeCell("white", [], 0, true),
      makeCell("black", [{ axis: "mode", value: "Dark" }], 1),
      makeCell(
        "#111",
        [
          { axis: "mode", value: "Dark" },
          { axis: "density", value: "condensed" },
        ],
        2,
      ),
    ],
  },
  {
    name: "--gap",
    value: "8px",
    cells: [
      makeCell("8px", [], 0, true),
      makeCell("4px", [{ axis: "density", value: "condensed" }], 3),
    ],
  },
];

async function openModeMenu(axisValue: string) {
  fireEvent.pointerDown(screen.getByLabelText(`轴 mode 值 ${axisValue} 选项`), {
    button: 0,
  });
  return screen.findByRole("menu");
}

describe("TokensPanel", () => {
  it("renders token list with default mode column", () => {
    const { getByText, getByLabelText, getByRole } = render(
      <TokensPanel tokens={SAMPLE_TOKENS} />,
    );

    expect(getByText("--color-primary")).toBeDefined();
    expect(getByText("--space-2")).toBeDefined();
    expect(getByText("--radius-md")).toBeDefined();

    const colorInput = getByLabelText(
      "变量 --color-primary 的值",
    ) as HTMLInputElement;
    expect(colorInput.value).toBe("#2f6bff");

    const headers = within(getByRole("table")).getAllByRole("columnheader");
    expect(headers).toHaveLength(3);
    expect(headers[1]?.textContent).toContain("default");
  });

  it("filters tokens by name or mode-specific value", () => {
    const { getByPlaceholderText, getByText, queryByText, rerender } = render(
      <TokensPanel tokens={SAMPLE_TOKENS} />,
    );

    const searchInput = getByPlaceholderText(
      "搜索变量名或值...",
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "space" } });
    expect(getByText("--space-2")).toBeDefined();
    expect(queryByText("--color-primary")).toBeNull();

    rerender(<TokensPanel tokens={MODE_TOKENS} modes={MODES} />);
    fireEvent.change(getByPlaceholderText("搜索变量名或值..."), {
      target: { value: "9db8ff" },
    });
    expect(getByText("--color-primary")).toBeDefined();
    expect(queryByText("--space-2")).toBeNull();
  });

  it("calls onSetToken with two arguments when no modes prop is supplied", () => {
    const onSetToken = vi.fn();
    const onRefreshToken = vi.fn();

    const { getByLabelText } = render(
      <TokensPanel
        tokens={SAMPLE_TOKENS}
        onSetToken={onSetToken}
        onRefreshToken={onRefreshToken}
      />,
    );

    const input = getByLabelText("变量 --space-2 的值") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12px" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSetToken).toHaveBeenCalledWith("--space-2", "12px");
    expect(onRefreshToken).toHaveBeenCalledTimes(1);
  });

  it("renders axis columns with explicit values and inherited fallback", () => {
    const { getByRole, getByLabelText } = render(
      <TokensPanel tokens={MODE_TOKENS} modes={MODES} />,
    );

    const headers = within(getByRole("table")).getAllByRole("columnheader");
    expect(headers).toHaveLength(4);
    expect(headers[1]?.textContent).toContain("Light");
    expect(headers[2]?.textContent).toContain("Dark");

    const light = getByLabelText(
      "变量 --color-primary 在轴 mode / Light 的值",
    ) as HTMLInputElement;
    const dark = getByLabelText(
      "变量 --color-primary 在轴 mode / Dark 的值",
    ) as HTMLInputElement;
    expect(light.value).toBe("#2f6bff");
    expect(dark.value).toBe("#9db8ff");

    const inheritedDark = getByLabelText(
      "变量 --space-2 在轴 mode / Dark 的值",
    ) as HTMLInputElement;
    expect(inheritedDark.value).toBe("");
    expect(inheritedDark.placeholder).toBe("8px");
    expect(inheritedDark.getAttribute("data-inherited")).toBe("true");
  });

  it("edits values in axis columns and ignores untouched inherited cells", () => {
    const onSetToken = vi.fn();
    const onRefreshToken = vi.fn();
    const { getByLabelText } = render(
      <TokensPanel
        tokens={MODE_TOKENS}
        modes={MODES}
        onSetToken={onSetToken}
        onRefreshToken={onRefreshToken}
      />,
    );

    const untouched = getByLabelText("变量 --space-2 在轴 mode / Dark 的值");
    fireEvent.blur(untouched);
    expect(onSetToken).not.toHaveBeenCalled();

    fireEvent.change(untouched, { target: { value: "16px" } });
    fireEvent.keyDown(untouched, { key: "Enter" });
    expect(onSetToken).toHaveBeenCalledWith(
      "--space-2",
      "16px",
      "mode",
      "Dark",
      [{ axis: "mode", value: "Dark" }],
    );
    expect(onRefreshToken).toHaveBeenCalledTimes(1);
  });

  it("adds a mode through a titled dialog and rejects duplicate names", () => {
    const onAddMode = vi.fn();
    const onRefreshToken = vi.fn();
    const { getByLabelText } = render(
      <TokensPanel
        tokens={MODE_TOKENS}
        modes={MODES}
        onAddMode={onAddMode}
        onRefreshToken={onRefreshToken}
      />,
    );

    fireEvent.click(getByLabelText("新建模式"));
    const dialog = screen.getByRole("dialog", { name: "新建模式" });
    const input = within(dialog).getByLabelText("模式名称");
    const submit = within(dialog).getByRole("button", { name: "添加" });
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(input, { target: { value: "Dark" } });
    expect(submit.hasAttribute("disabled")).toBe(true);
    expect(within(dialog).getByText("已存在同名模式")).toBeDefined();

    fireEvent.change(input, { target: { value: " High Contrast " } });
    expect(submit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(submit);

    expect(onAddMode).toHaveBeenCalledWith("High Contrast");
    expect(onRefreshToken).toHaveBeenCalledTimes(1);
  });

  it("renames the default mode through a titled dialog", async () => {
    const onRenameMode = vi.fn();
    render(
      <TokensPanel
        tokens={MODE_TOKENS}
        modes={MODES}
        onRenameMode={onRenameMode}
      />,
    );

    const menu = await openModeMenu("Light");
    expect(within(menu).queryByText("删除")).toBeNull();
    fireEvent.click(within(menu).getByText("重命名"));

    const dialog = screen.getByRole("dialog", { name: "重命名模式" });
    const input = within(dialog).getByLabelText("模式名称");
    expect((input as HTMLInputElement).value).toBe("Light");

    fireEvent.change(input, { target: { value: "Day" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(onRenameMode).toHaveBeenCalledWith("Light", "Day");
  });

  it("deletes a non-default mode after confirmation", async () => {
    const onDeleteMode = vi.fn();
    render(
      <TokensPanel
        tokens={MODE_TOKENS}
        modes={MODES}
        onDeleteMode={onDeleteMode}
      />,
    );

    const menu = await openModeMenu("Dark");
    fireEvent.click(within(menu).getByText("删除"));

    const alert = screen.getByRole("alertdialog", { name: "删除模式" });
    expect(within(alert).getByText(/Dark/)).toBeDefined();
    fireEvent.click(within(alert).getByRole("button", { name: "删除" }));

    expect(onDeleteMode).toHaveBeenCalledWith("Dark");
  });

  it("opens create dialog and calls onCreateToken and onRefreshToken", () => {
    const onCreateToken = vi.fn();
    const onRefreshToken = vi.fn();

    const { getByLabelText, getByText } = render(
      <TokensPanel
        tokens={SAMPLE_TOKENS}
        onCreateToken={onCreateToken}
        onRefreshToken={onRefreshToken}
      />,
    );

    const createBtn = getByLabelText("新建变量");
    fireEvent.click(createBtn);

    const nameInput = getByLabelText("变量名称") as HTMLInputElement;
    const valueInput = getByLabelText("变量值") as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "color-danger" } });
    fireEvent.change(valueInput, { target: { value: "#ef4444" } });

    const submitBtn = getByText("创建");
    fireEvent.click(submitBtn);

    expect(onCreateToken).toHaveBeenCalledWith("--color-danger", "#ef4444");
    expect(onRefreshToken).toHaveBeenCalledTimes(1);
  });

  it("groups columns by axis and exposes axis values on headers", () => {
    const { getByRole } = render(
      <TokensPanel tokens={MULTI_AXIS_TOKENS} modes={MODES} />,
    );
    const headers = within(getByRole("table")).getAllByRole("columnheader");
    expect(headers).toHaveLength(6);
    expect(headers[1]?.getAttribute("data-axis")).toBe(":root");
    expect(headers[1]?.getAttribute("data-axis-value")).toBe("default");
    expect(headers[2]?.getAttribute("data-axis")).toBe("density");
    expect(headers[2]?.getAttribute("data-axis-value")).toBe("condensed");
    expect(headers[3]?.getAttribute("data-axis")).toBe("mode");
    expect(headers[3]?.getAttribute("data-axis-value")).toBe("Dark");
    expect(headers[4]?.getAttribute("data-axis")).toBe("density+mode");
    expect(headers[4]?.getAttribute("data-axis-value")).toBe("condensed+Dark");
    for (const header of headers.slice(1, 5)) {
      expect(header?.getAttribute("data-mode")).toBeNull();
    }
  });

  it("emits axis and axisValue when editing a cell", () => {
    const onSetToken = vi.fn();
    const { getByLabelText } = render(
      <TokensPanel
        tokens={MULTI_AXIS_TOKENS}
        modes={MODES}
        onSetToken={onSetToken}
      />,
    );
    const input = getByLabelText("变量 --gap 在轴 density / condensed 的值");
    fireEvent.change(input, { target: { value: "6px" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetToken).toHaveBeenCalledWith(
      "--gap",
      "6px",
      "density",
      "condensed",
      [{ axis: "density", value: "condensed" }],
    );
  });

  it("encodes cell references for shell actions", () => {
    expect(encodeTokenCellRef([])).toBe("ombrique root");
    expect(encodeTokenCellRef([{ axis: "mode", value: "dark" }])).toBe(
      "ombrique mode---dark",
    );
    const encoded = encodeTokenCellRef([
      { axis: "mode", value: "Night mode" },
      { axis: "density", value: "condensed" },
    ]);
    expect(encoded).toBe("ombrique mode---Night-20-mode density---condensed");
    expect(tokenModeNameSchema.safeParse(encoded).success).toBe(true);
  });
});
