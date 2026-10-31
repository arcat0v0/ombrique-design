import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetsPanel } from "./AssetsPanel";
import type { ComponentItem } from "./types";
afterEach(cleanup);

describe("AssetsPanel", () => {
  const sampleComponents: ComponentItem[] = [
    {
      name: "Button",
      file: "components/Button.tsx",
      axes: [
        { name: "size", values: ["small", "medium", "large"] },
        { name: "state", values: ["default", "hover"] },
      ],
    },
    {
      name: "Card",
      file: "components/Card.tsx",
    },
    {
      name: "Header",
      file: "components/layout/Header.tsx",
    },
  ];

  it("filters components based on search query", () => {
    const { getByText, queryByText, getByPlaceholderText } = render(
      <AssetsPanel components={sampleComponents} />,
    );

    const searchInput = getByPlaceholderText("搜索组件...");
    fireEvent.change(searchInput, { target: { value: "Card" } });

    expect(getByText("Card")).toBeDefined();
    expect(queryByText("Button")).toBeNull();
    expect(queryByText("Header")).toBeNull();
  });

  it("switches to list view mode and allows clicking insert", () => {
    const onInsert = vi.fn();
    const { getByLabelText, getByText } = render(
      <AssetsPanel
        components={sampleComponents}
        onInsertComponent={onInsert}
      />,
    );

    const listViewBtn = getByLabelText("列表视图");
    fireEvent.click(listViewBtn);

    expect(getByText("Button")).toBeDefined();
    expect(getByText(/变体集 \(size, state\)/)).toBeDefined();

    const insertBtn = getByLabelText("插入 Button");
    fireEvent.click(insertBtn);

    expect(onInsert).toHaveBeenCalledWith("Button");
  });

  it("configures drag dataTransfer on drag start", () => {
    const { getByTestId } = render(
      <AssetsPanel components={sampleComponents} />,
    );

    const item = getByTestId("asset-item-Button");
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: "",
    };

    fireEvent.dragStart(item, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "application/ombrique-component",
      "Button",
    );
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "Button");
    expect(dataTransfer.effectAllowed).toBe("copy");
  });
});
