import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeActions, makeView } from "./fixtures";
import { Shell } from "./Shell";

afterEach(cleanup);

describe("Shell", () => {
  it("shows the workspace when no project is open", () => {
    const onCreateProject = vi.fn();
    const { getAllByText, getByText, queryByLabelText } = render(
      <Shell
        view={makeView({ projectRoot: null })}
        actions={makeActions({ createProject: onCreateProject })}
      />,
    );
    expect(getByText("继续你的设计")).toBeDefined();
    const createButton = getAllByText("新建项目")[0];
    if (createButton) fireEvent.click(createButton);
    expect(onCreateProject).toHaveBeenCalledTimes(1);
    expect(queryByLabelText("撤销")).toBeNull();
  });

  it("shows window controls only on Linux and routes window actions", () => {
    const minimizeWindow = vi.fn();
    const toggleWindowMaximize = vi.fn();
    const closeWindow = vi.fn();
    const { getByLabelText, rerender, queryByLabelText } = render(
      <Shell
        view={makeView({ platform: "linux" })}
        actions={makeActions({
          minimizeWindow,
          toggleWindowMaximize,
          closeWindow,
        })}
      />,
    );

    fireEvent.click(getByLabelText("最小化"));
    fireEvent.click(getByLabelText("最大化"));
    fireEvent.click(getByLabelText("关闭"));
    expect(minimizeWindow).toHaveBeenCalledTimes(1);
    expect(toggleWindowMaximize).toHaveBeenCalledTimes(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);

    rerender(
      <Shell
        view={makeView({ platform: "darwin" })}
        actions={makeActions()}
      />,
    );
    expect(queryByLabelText("最小化")).toBeNull();
  });

  it("shows diagnostics count and notice from the view", () => {
    const { getByText, getByLabelText } = render(
      <Shell
        view={makeView({
          diagnostics: [
            { file: "App.tsx", message: "类型错误", severity: "error" },
          ],
          notice: "已打开项目",
        })}
        actions={makeActions()}
      />,
    );
    expect(getByText("1 条诊断")).toBeDefined();
    expect(getByText("已打开项目")).toBeDefined();
    expect(getByLabelText("关闭通知")).toBeDefined();
  });

  it("routes keyboard shortcuts for editing, history, and grouping", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const duplicateSelection = vi.fn();
    const deleteSelection = vi.fn();
    const groupSelection = vi.fn();
    const ungroupSelection = vi.fn();
    const toggleHidden = vi.fn();
    const toggleLocked = vi.fn();
    const zoomToFit = vi.fn();

    render(
      <Shell
        view={makeView({
          selection: {
            id: "l1",
            name: "Title",
            tag: "text",
            editable: true,
            styles: [],
            attrs: [],
            text: "Hello",
          },
        })}
        actions={makeActions({
          undo,
          redo,
          duplicateSelection,
          deleteSelection,
          groupSelection,
          ungroupSelection,
          toggleHidden,
          toggleLocked,
          zoomToFit,
        })}
      />,
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
    );
    expect(undo).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(redo).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true }),
    );
    expect(duplicateSelection).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(deleteSelection).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", metaKey: true }),
    );
    expect(groupSelection).toHaveBeenCalledWith("Group");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", metaKey: true, shiftKey: true }),
    );
    expect(ungroupSelection).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "h", ctrlKey: true, shiftKey: true }),
    );
    expect(toggleHidden).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "l", ctrlKey: true, shiftKey: true }),
    );
    expect(toggleLocked).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", shiftKey: true }),
    );
    expect(zoomToFit).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts while typing in an input", () => {
    const undo = vi.fn();
    const { getByLabelText } = render(
      <Shell
        view={makeView({
          selection: {
            id: "l1",
            name: "Hero",
            tag: "section",
            editable: true,
            styles: [],
            attrs: [],
            text: null,
          },
        })}
        actions={makeActions({ undo })}
      />,
    );
    const input = getByLabelText("名称") as HTMLInputElement;
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(undo).not.toHaveBeenCalled();
  });

  it("disables Ungroup for non-group selections and enables for kind=group or Group tag", () => {
    const { getByLabelText, rerender } = render(
      <Shell
        view={makeView({
          selection: {
            id: "l1",
            name: "Title",
            tag: "text",
            kind: "text",
            editable: true,
            styles: [],
            attrs: [],
            text: "Hello",
          },
        })}
        actions={makeActions()}
      />,
    );

    const groupBtn = getByLabelText("编组") as HTMLButtonElement;
    const ungroupBtn = getByLabelText("解组") as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(false);
    expect(ungroupBtn.disabled).toBe(true);

    rerender(
      <Shell
        view={makeView({
          selection: {
            id: "l2",
            name: "Card",
            tag: "Group",
            kind: "group",
            editable: true,
            styles: [],
            attrs: [],
            text: null,
          },
        })}
        actions={makeActions()}
      />,
    );

    expect(ungroupBtn.disabled).toBe(false);
  });

  it("switches between Layers and Tokens tabs in the left panel", () => {
    const tokens = [
      { name: "--brand-primary", value: "#0077ff", category: "color" },
    ];
    const { getByLabelText, getByText } = render(
      <Shell view={makeView({ tokens })} actions={makeActions()} />,
    );

    const tokensTabBtn = getByLabelText("查看设计变量");
    fireEvent.click(tokensTabBtn);

    expect(getByText("--brand-primary")).toBeDefined();

    const layersTabBtn = getByLabelText("查看图层列表");
    fireEvent.click(layersTabBtn);

    expect(getByLabelText("图层树")).toBeDefined();
  });

  it("handles component drop onto canvas slot and dispatches createComponentInstance", () => {
    const createComponentInstance = vi.fn();
    const { getByTestId } = render(
      <Shell
        view={makeView()}
        actions={makeActions({ createComponentInstance })}
      />,
    );

    const canvasSlot = getByTestId("canvas-slot");
    const dataTransfer = {
      types: ["application/ombrique-component"],
      getData: vi.fn((type: string) =>
        type === "application/ombrique-component" ? "Button" : "",
      ),
      dropEffect: "",
    };

    fireEvent.dragOver(canvasSlot, { dataTransfer });
    fireEvent.drop(canvasSlot, {
      dataTransfer,
      clientX: 100,
      clientY: 150,
    });

    expect(createComponentInstance).toHaveBeenCalledWith(
      "Button",
      expect.any(Object),
    );
  });
});
