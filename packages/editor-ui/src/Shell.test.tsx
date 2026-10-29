import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeActions, makePage, makeView } from "./fixtures";
import { Shell } from "./Shell";

afterEach(cleanup);

describe("Shell", () => {
  it("renders top bar, left and right columns and the canvas slot", () => {
    const { container, getByTestId } = render(
      <Shell view={makeView()} actions={makeActions()} />,
    );
    expect(container.querySelector(".shell-topbar")).not.toBeNull();
    expect(container.querySelector(".shell-left")).not.toBeNull();
    expect(container.querySelector(".shell-right")).not.toBeNull();
    const canvasSlot = getByTestId("canvas-slot");
    expect(canvasSlot.querySelector(".canvas-mount")).not.toBeNull();
  });

  it("wires pages, layers and selection data into the panels", () => {
    const { getByText, getByLabelText } = render(
      <Shell
        view={makeView({
          pages: [makePage("p1", "首页")],
          activePageId: "p1",
          layers: [
            {
              id: "l1",
              name: "Hero",
              tag: "section",
              kind: "frame",
              depth: 0,
              hidden: false,
              locked: false,
              generated: false,
              children: [],
            },
          ],
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
        actions={makeActions()}
      />,
    );
    expect(getByText("首页")).toBeDefined();
    expect(getByText("Hero")).toBeDefined();
    expect(getByLabelText("名称")).toBeDefined();
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

  it("routes toolbar callbacks into the provided actions", async () => {
    const openProject = vi.fn();
    const { getByLabelText, findByText } = render(
      <Shell view={makeView()} actions={makeActions({ openProject })} />,
    );
    const openBtn = getByLabelText("打开项目");
    fireEvent.keyDown(openBtn, { key: "Enter" });
    const item = await findByText("打开本地项目目录");
    fireEvent.click(item);
    expect(openProject).toHaveBeenCalledTimes(1);
  });

  it("routes keyboard shortcuts to undo, redo, duplicate and delete", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const duplicateSelection = vi.fn();
    const deleteSelection = vi.fn();
    render(
      <Shell
        view={makeView()}
        actions={makeActions({
          undo,
          redo,
          duplicateSelection,
          deleteSelection,
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
      new KeyboardEvent("keydown", { key: "y", ctrlKey: true }),
    );
    expect(redo).toHaveBeenCalledTimes(2);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true }),
    );
    expect(duplicateSelection).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(deleteSelection).toHaveBeenCalledTimes(1);
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

  it("invokes updateCanvasBounds on mount when callback is provided", () => {
    const updateCanvasBounds = vi.fn();
    render(
      <Shell view={makeView()} actions={makeActions({ updateCanvasBounds })} />,
    );
    expect(updateCanvasBounds).toHaveBeenCalledTimes(1);
    const bounds = updateCanvasBounds.mock.calls[0]?.[0];
    expect(typeof bounds?.x).toBe("number");
    expect(typeof bounds?.width).toBe("number");
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

  it("dispatches groupSelection and ungroupSelection on Cmd+G and Cmd+Shift+G", () => {
    const groupSelection = vi.fn();
    const ungroupSelection = vi.fn();

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
        actions={makeActions({ groupSelection, ungroupSelection })}
      />,
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", metaKey: true }),
    );
    expect(groupSelection).toHaveBeenCalledWith("Group");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", metaKey: true, shiftKey: true }),
    );
    expect(ungroupSelection).toHaveBeenCalledTimes(1);
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
});
