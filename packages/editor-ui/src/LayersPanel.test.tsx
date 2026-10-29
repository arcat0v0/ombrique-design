import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeLayer } from "./fixtures";
import { LayersPanel } from "./LayersPanel";

afterEach(cleanup);

describe("LayersPanel", () => {
  it("renders nested layers recursively with depth-based indentation", () => {
    const layers = [
      makeLayer({
        id: "root",
        name: "Root",
        depth: 0,
        children: [
          makeLayer({ id: "child", name: "Child", tag: "span", depth: 1 }),
        ],
      }),
    ];
    const { getByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={() => {}}
      />,
    );
    expect(getByText("Root")).toBeDefined();
    const child = getByText("Child");
    expect(child).toBeDefined();
    const childRow = child.closest<HTMLElement>(".layer-row");
    const rootRow = getByText("Root").closest<HTMLElement>(".layer-row");
    expect(childRow?.style.paddingLeft).toBe("20px");
    expect(rootRow?.style.paddingLeft).toBe("8px");
  });

  it("marks hidden layers with data-hidden and dims their text", () => {
    const layers = [makeLayer({ id: "h", name: "Hidden", hidden: true })];
    const { container } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={() => {}}
      />,
    );
    const row = container.querySelector("[data-hidden='true']");
    expect(row).not.toBeNull();
    expect(row?.className).toContain("layer-row-hidden");
  });

  it("shows a lock marker for locked layers", () => {
    const layers = [makeLayer({ id: "l", name: "Locked", locked: true })];
    const { container, getByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={() => {}}
      />,
    );
    const row = getByText("Locked").closest(".layer-row");
    expect(row?.querySelector(".layer-lock")).not.toBeNull();
    expect(container.querySelector(".layer-lock")).not.toBeNull();
  });

  it("marks generated layers with data-generated and a badge", () => {
    const layers = [makeLayer({ id: "g", name: "Gen", generated: true })];
    const { container, getByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={() => {}}
      />,
    );
    const row = getByText("Gen").closest(".layer-row");
    expect(row?.getAttribute("data-generated")).toBe("true");
    expect(row?.textContent).toContain("代码生成");
    expect(container.querySelector("[data-generated='true']")).not.toBeNull();
  });

  it("calls onSelectLayer with the layer id when a row is clicked", () => {
    const onSelectLayer = vi.fn();
    const layers = [
      makeLayer({ id: "a", name: "A" }),
      makeLayer({ id: "b", name: "B" }),
    ];
    const { getByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
      />,
    );
    getByText("B").click();
    expect(onSelectLayer).toHaveBeenCalledWith("b");
  });

  it("marks the selected row with aria-selected", () => {
    const layers = [
      makeLayer({ id: "a", name: "A" }),
      makeLayer({ id: "b", name: "B" }),
    ];
    const { getByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId="b"
        onSelectLayer={() => {}}
      />,
    );
    expect(
      getByText("B").closest(".layer-row")?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      getByText("A").closest(".layer-row")?.getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("shows the empty state when there are no layers", () => {
    const { getByText, queryByRole } = render(
      <LayersPanel
        layers={[]}
        selectedLayerId={null}
        onSelectLayer={() => {}}
      />,
    );
    expect(getByText("暂无图层")).toBeDefined();
    expect(queryByRole("tree")).toBeNull();
  });

  it("selects a layer with the keyboard on a focused row", () => {
    const onSelectLayer = vi.fn();
    const layers = [makeLayer({ id: "a", name: "A" })];
    const { getByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
      />,
    );
    const row = getByText("A").closest(".layer-row");
    (row as HTMLElement).click();
    expect(onSelectLayer).toHaveBeenCalledWith("a");
  });

  it("selects a layer via Enter key on the row button", () => {
    const onSelectLayer = vi.fn();
    const layers = [makeLayer({ id: "a", name: "A" })];
    const { getByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
      />,
    );
    const row = getByText("A").closest(".layer-row") as HTMLElement | null;
    expect(row).not.toBeNull();
    row?.focus();
    fireEvent.keyDown(row as HTMLElement, { key: "Enter" });
    expect(onSelectLayer).toHaveBeenCalledWith("a");
  });

  it("renders child rows outside parent click row and stops bubbling", () => {
    const child = makeLayer({
      id: "child-node",
      name: "Child Button",
      depth: 1,
    });
    const parent = makeLayer({
      id: "parent-node",
      name: "Parent Card",
      depth: 0,
      children: [child],
    });
    const selectedIds: string[] = [];
    const onSelectLayer = (id: string) => {
      selectedIds.push(id);
    };

    const { getByText } = render(
      <LayersPanel
        layers={[parent]}
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
      />,
    );

    const parentText = getByText("Parent Card");
    const childText = getByText("Child Button");
    const parentRow = parentText.closest(".layer-row");
    const childRow = childText.closest(".layer-row");

    expect(parentRow).not.toBeNull();
    expect(childRow).not.toBeNull();
    expect(parentRow?.contains(childRow)).toBe(false);

    (childRow as HTMLElement)?.click();
    expect(selectedIds).toEqual(["child-node"]);
  });

  it("toggles child visibility when clicking chevron button", () => {
    const child = makeLayer({
      id: "child-node",
      name: "Nested Text",
      depth: 1,
    });
    const parent = makeLayer({
      id: "parent-node",
      name: "Parent Group",
      depth: 0,
      children: [child],
    });
    const { getByText, queryByText, getByLabelText } = render(
      <LayersPanel
        layers={[parent]}
        selectedLayerId={null}
        onSelectLayer={() => {}}
      />,
    );

    expect(getByText("Nested Text")).toBeDefined();
    const chevron = getByLabelText("折叠 Parent Group");
    fireEvent.click(chevron);
    expect(queryByText("Nested Text")).toBeNull();

    fireEvent.click(getByLabelText("展开 Parent Group"));
    expect(getByText("Nested Text")).toBeDefined();
  });

  it("filters layers by search query and shows empty state when none match", () => {
    const layers = [
      makeLayer({ id: "l1", name: "Header Frame" }),
      makeLayer({ id: "l2", name: "Footer Text" }),
    ];
    const { getByLabelText, getByText, queryByText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={() => {}}
      />,
    );

    const searchInput = getByLabelText("搜索图层") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Footer" } });

    expect(getByText("Footer Text")).toBeDefined();
    expect(queryByText("Header Frame")).toBeNull();

    fireEvent.change(searchInput, { target: { value: "UnknownNonExistent" } });
    expect(getByText("未找到匹配图层")).toBeDefined();

    fireEvent.click(getByLabelText("清除搜索"));
    expect(getByText("Header Frame")).toBeDefined();
  });

  it("triggers inline rename on double click and commits with Enter", () => {
    const onSetName = vi.fn();
    const layer = makeLayer({ id: "l1", name: "Original Name" });
    const { getByText } = render(
      <LayersPanel
        layers={[layer]}
        selectedLayerId="l1"
        onSelectLayer={() => {}}
        onSetName={onSetName}
      />,
    );

    const row = getByText("Original Name").closest(".layer-row");
    fireEvent.doubleClick(row as HTMLElement);

    const editInput = row?.querySelector("input") as HTMLInputElement;
    expect(editInput).not.toBeNull();
    expect(editInput.value).toBe("Original Name");

    fireEvent.change(editInput, { target: { value: "Renamed Layer" } });
    fireEvent.keyDown(editInput, { key: "Enter" });
    expect(onSetName).toHaveBeenCalledWith("Renamed Layer");
  });

  it("invokes onToggleLockedForLayer when quick lock button is clicked", () => {
    const onToggleLockedForLayer = vi.fn();
    const layer = makeLayer({ id: "l1", name: "Card", locked: false });
    const { getByLabelText } = render(
      <LayersPanel
        layers={[layer]}
        selectedLayerId="l1"
        onSelectLayer={() => {}}
        onToggleLockedForLayer={onToggleLockedForLayer}
      />,
    );

    fireEvent.click(getByLabelText("锁定图层"));
    expect(onToggleLockedForLayer).toHaveBeenCalledWith("l1", true);
  });

  it("invokes onToggleHiddenForLayer when quick eye button is clicked", () => {
    const onToggleHiddenForLayer = vi.fn();
    const layer = makeLayer({ id: "l2", name: "Button", hidden: false });
    const { getByLabelText } = render(
      <LayersPanel
        layers={[layer]}
        selectedLayerId="l2"
        onSelectLayer={() => {}}
        onToggleHiddenForLayer={onToggleHiddenForLayer}
      />,
    );

    fireEvent.click(getByLabelText("隐藏图层"));
    expect(onToggleHiddenForLayer).toHaveBeenCalledWith("l2", true);
  });

  it("falls back to onSelectLayer and onToggleLocked when per-layer contract is absent", () => {
    const onSelectLayer = vi.fn();
    const onToggleLocked = vi.fn();
    const layer = makeLayer({ id: "l3", name: "Header", locked: false });
    const { getByLabelText } = render(
      <LayersPanel
        layers={[layer]}
        selectedLayerId="other"
        onSelectLayer={onSelectLayer}
        onToggleLocked={onToggleLocked}
      />,
    );

    fireEvent.click(getByLabelText("锁定图层"));
    expect(onSelectLayer).toHaveBeenCalledWith("l3");
    expect(onToggleLocked).toHaveBeenCalled();
  });
});
