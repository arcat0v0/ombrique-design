import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePage } from "./fixtures";
import { PagesPanel } from "./PagesPanel";

afterEach(cleanup);

describe("PagesPanel", () => {
  it("marks the active page with aria-current and highlights it", () => {
    const { getByText } = render(
      <PagesPanel
        pages={[makePage("p1", "首页"), makePage("p2", "详情")]}
        activePageId="p2"
        onSelectPage={() => {}}
        onAddPage={() => {}}
      />,
    );
    const active = getByText("详情");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("page-tab-active");
    expect(getByText("首页").getAttribute("aria-current")).toBeNull();
  });

  it("calls onSelectPage with the page id on click", () => {
    const onSelectPage = vi.fn();
    const { getByText } = render(
      <PagesPanel
        pages={[makePage("p1", "首页")]}
        activePageId="p1"
        onSelectPage={onSelectPage}
        onAddPage={() => {}}
      />,
    );
    getByText("首页").click();
    expect(onSelectPage).toHaveBeenCalledWith("p1");
  });

  it("calls onAddPage when the add button is clicked", () => {
    const onAddPage = vi.fn();
    const { getByLabelText } = render(
      <PagesPanel
        pages={[]}
        activePageId={null}
        onSelectPage={() => {}}
        onAddPage={onAddPage}
      />,
    );
    getByLabelText("添加页面").click();
    expect(onAddPage).toHaveBeenCalledTimes(1);
  });

  it("triggers rename dialog and commits new page name", () => {
    const onRenamePage = vi.fn();
    const { getByLabelText } = render(
      <PagesPanel
        pages={[makePage("p1", "首页")]}
        activePageId="p1"
        onSelectPage={() => {}}
        onAddPage={() => {}}
        onRenamePage={onRenamePage}
      />,
    );

    const optionsBtn = getByLabelText("页面 首页 选项");
    fireEvent.click(optionsBtn);

    const renameItem = screen.getByText("重命名");
    fireEvent.click(renameItem);

    const input = screen.getByPlaceholderText(
      "输入页面名称",
    ) as HTMLInputElement;
    expect(input.value).toBe("首页");

    fireEvent.change(input, { target: { value: "新首页" } });

    const saveBtn = screen.getByText("保存");
    fireEvent.click(saveBtn);

    expect(onRenamePage).toHaveBeenCalledWith("p1", "新首页");
  });

  it("triggers delete confirmation alert and confirms deletion", () => {
    const onDeletePage = vi.fn();
    const { getByLabelText } = render(
      <PagesPanel
        pages={[makePage("p1", "首页"), makePage("p2", "关于")]}
        activePageId="p1"
        onSelectPage={() => {}}
        onAddPage={() => {}}
        onDeletePage={onDeletePage}
      />,
    );

    const optionsBtn = getByLabelText("页面 关于 选项");
    fireEvent.click(optionsBtn);

    const deleteItem = screen.getByText("删除");
    fireEvent.click(deleteItem);

    expect(
      screen.getByText('确定要删除页面 "关于" 吗？此操作不可撤销。'),
    ).toBeDefined();

    const confirmButtons = screen.getAllByText("删除");
    const actionBtn = confirmButtons[confirmButtons.length - 1];
    fireEvent.click(actionBtn as HTMLElement);

    expect(onDeletePage).toHaveBeenCalledWith("p2");
  });
});
