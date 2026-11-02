import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowControls } from "./WindowControls";

afterEach(cleanup);

describe("WindowControls", () => {
  it("routes minimize, maximize, and close actions", () => {
    const onMinimize = vi.fn();
    const onToggleMaximize = vi.fn();
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <WindowControls
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />,
    );

    fireEvent.click(getByLabelText("最小化"));
    fireEvent.click(getByLabelText("最大化"));
    fireEvent.click(getByLabelText("关闭"));

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches the maximize control to restore while maximized", () => {
    const { getByLabelText, queryByLabelText } = render(
      <WindowControls maximized onToggleMaximize={() => {}} />,
    );

    expect(getByLabelText("还原窗口")).toBeDefined();
    expect(queryByLabelText("最大化")).toBeNull();
  });

  it("disables controls without callbacks", () => {
    const { getByLabelText } = render(<WindowControls />);

    expect((getByLabelText("最小化") as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText("最大化") as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText("关闭") as HTMLButtonElement).disabled).toBe(true);
  });
});