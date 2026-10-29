import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokensPanel } from "./TokensPanel";
import type { TokenItem } from "./types";

afterEach(cleanup);

const SAMPLE_TOKENS: TokenItem[] = [
  { name: "--color-primary", value: "#2f6bff", category: "color" },
  { name: "--space-2", value: "8px", category: "spacing" },
  { name: "--radius-md", value: "10px", category: "radius" },
];

describe("TokensPanel", () => {
  it("renders token list with name, value and color preview", () => {
    const { getByText, getByLabelText } = render(
      <TokensPanel tokens={SAMPLE_TOKENS} />,
    );

    expect(getByText("--color-primary")).toBeDefined();
    expect(getByText("--space-2")).toBeDefined();
    expect(getByText("--radius-md")).toBeDefined();

    const colorInput = getByLabelText(
      "变量 --color-primary 的值",
    ) as HTMLInputElement;
    expect(colorInput.value).toBe("#2f6bff");
  });

  it("filters tokens by search query", () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <TokensPanel tokens={SAMPLE_TOKENS} />,
    );

    const searchInput = getByPlaceholderText(
      "搜索变量名或值...",
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "space" } });

    expect(getByText("--space-2")).toBeDefined();
    expect(queryByText("--color-primary")).toBeNull();
  });

  it("calls onSetToken and onRefreshToken when editing token value", () => {
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

  it("disables edit input when onSetToken is not wired", () => {
    const { getByLabelText } = render(<TokensPanel tokens={SAMPLE_TOKENS} />);

    const input = getByLabelText("变量 --space-2 的值") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.title).toBe("核心尚未接线 setToken");
  });

  it("disables create button when onCreateToken is not wired", () => {
    const { getByLabelText } = render(<TokensPanel tokens={SAMPLE_TOKENS} />);

    const createBtn = getByLabelText("新建变量") as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
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

  it("copies var(--name) to clipboard when copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const { getByLabelText } = render(<TokensPanel tokens={SAMPLE_TOKENS} />);

    const copyBtn = getByLabelText("复制变量名 --color-primary");
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith("var(--color-primary)");
  });
});
