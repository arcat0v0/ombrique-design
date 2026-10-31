import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportSection } from "./ExportSection";

afterEach(cleanup);

describe("ExportSection", () => {
  it("renders with default 1x PNG row and export button with node name", () => {
    const onExportNode = vi.fn();
    const { getByText, getByRole } = render(
      <ExportSection targetName="HeroCard" onExportNode={onExportNode} />,
    );

    expect(getByText("导出 Export")).toBeDefined();
    expect(getByText("导出 HeroCard")).toBeDefined();

    const exportBtn = getByRole("button", { name: "导出 HeroCard" });
    fireEvent.click(exportBtn);

    expect(onExportNode).toHaveBeenCalledTimes(1);
    const passed = onExportNode.mock.calls[0]?.[0];
    expect(Array.isArray(passed)).toBe(true);
    expect(passed[0]).toMatchObject({
      format: "png",
      scale: { type: "scale", value: 1 },
    });
  });

  it("adds, removes, and updates export rows notifying onSetAttrs", () => {
    const onSetAttrs = vi.fn();
    const { getByLabelText, getAllByLabelText, getAllByPlaceholderText } =
      render(<ExportSection targetName="Button" onSetAttrs={onSetAttrs} />);

    const addBtn = getByLabelText("添加导出设置");
    fireEvent.click(addBtn);

    expect(onSetAttrs).toHaveBeenCalled();
    const lastCall =
      onSetAttrs.mock.calls[onSetAttrs.mock.calls.length - 1]?.[0];
    expect(lastCall["data-export"]).toContain(";");

    const suffixInput = getAllByPlaceholderText("后缀")[0];
    if (suffixInput)
      fireEvent.change(suffixInput, { target: { value: "@3x" } });
    expect(onSetAttrs).toHaveBeenCalledWith({
      "data-export": expect.stringContaining("@3x"),
    });

    const removeBtns = getAllByLabelText("删除导出设置");
    const firstRemove = removeBtns[0];
    if (firstRemove) {
      fireEvent.click(firstRemove);
    }
    expect(onSetAttrs).toHaveBeenCalled();
  });
});
