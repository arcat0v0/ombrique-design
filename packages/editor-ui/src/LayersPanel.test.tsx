import {
  cleanup,
  createEvent,
  fireEvent,
  render,
} from "@testing-library/react";
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

  it("selects row on click or keyboard Enter and marks aria-selected", () => {
    const onSelectLayer = vi.fn();
    const layers = [
      makeLayer({ id: "a", name: "A" }),
      makeLayer({ id: "b", name: "B" }),
    ];
    const { getByText, rerender } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
      />,
    );

    getByText("B").click();
    expect(onSelectLayer).toHaveBeenCalledWith("b");

    rerender(
      <LayersPanel
        layers={layers}
        selectedLayerId="b"
        onSelectLayer={onSelectLayer}
      />,
    );
    expect(
      getByText("B").closest(".layer-row")?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      getByText("A").closest(".layer-row")?.getAttribute("aria-selected"),
    ).toBe("false");

    const rowA = getByText("A").closest(".layer-row") as HTMLElement;
    rowA.focus();
    fireEvent.keyDown(rowA, { key: "Enter" });
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

  it("invokes onToggleLockedForLayer and onToggleHiddenForLayer on quick action clicks", () => {
    const onToggleLockedForLayer = vi.fn();
    const onToggleHiddenForLayer = vi.fn();
    const layers = [
      makeLayer({ id: "l1", name: "Card", locked: false, hidden: false }),
    ];
    const { getByLabelText } = render(
      <LayersPanel
        layers={layers}
        selectedLayerId="l1"
        onSelectLayer={() => {}}
        onToggleLockedForLayer={onToggleLockedForLayer}
        onToggleHiddenForLayer={onToggleHiddenForLayer}
      />,
    );

    fireEvent.click(getByLabelText("锁定图层"));
    expect(onToggleLockedForLayer).toHaveBeenCalledWith("l1", true);

    fireEvent.click(getByLabelText("隐藏图层"));
    expect(onToggleHiddenForLayer).toHaveBeenCalledWith("l1", true);
  });
  describe("drag and drop", () => {
    interface MockDataTransfer {
      setData: (key: string, val: string) => void;
      getData: (key: string) => string;
      effectAllowed: string;
      dropEffect: string;
    }

    function mockDataTransfer(): MockDataTransfer {
      const store: Record<string, string> = {};
      return {
        setData: vi.fn((key: string, val: string) => {
          store[key] = val;
        }),
        getData: vi.fn((key: string) => store[key] ?? ""),
        effectAllowed: "none",
        dropEffect: "none",
      };
    }

    function fireDragOver(
      element: HTMLElement,
      dt: MockDataTransfer,
      clientY: number,
    ) {
      const event = createEvent.dragOver(element);
      Object.defineProperty(event, "clientY", { value: clientY });
      Object.defineProperty(event, "dataTransfer", { value: dt });
      fireEvent(element, event);
    }

    function fireDrop(element: HTMLElement, dt: MockDataTransfer) {
      const event = createEvent.drop(element);
      Object.defineProperty(event, "dataTransfer", { value: dt });
      fireEvent(element, event);
    }
    function getRow(container: HTMLElement, name: string): HTMLElement {
      const match = Array.from(
        container.querySelectorAll<HTMLElement>(".layer-row"),
      ).find((r) => r.textContent?.includes(name));
      if (!match) throw new Error(`Row ${name} not found`);
      return match;
    }

    it("shows insertion line or container highlight when dragging over rows", () => {
      const layers = [
        makeLayer({ id: "a", name: "Layer A" }),
        makeLayer({ id: "b", name: "Layer B" }),
        makeLayer({ id: "f1", name: "Frame 1", kind: "frame" }),
      ];
      const { container } = render(
        <LayersPanel
          layers={layers}
          selectedLayerId={null}
          onSelectLayer={() => {}}
        />,
      );
      const rowA = getRow(container, "Layer A");
      const rowB = getRow(container, "Layer B");
      const rowF1 = getRow(container, "Frame 1");
      const rect = {
        top: 100,
        bottom: 128,
        height: 28,
        left: 0,
        right: 200,
        width: 200,
      } as DOMRect;
      rowB.getBoundingClientRect = () => rect;
      rowF1.getBoundingClientRect = () => rect;

      const dt = mockDataTransfer();
      fireEvent.dragStart(rowA, { dataTransfer: dt });

      fireDragOver(rowB, dt, 105);
      expect(
        container.querySelector("[data-testid='drop-indicator-before']"),
      ).not.toBeNull();

      fireDragOver(rowF1, dt, 114);
      expect(rowF1.getAttribute("data-drop-inside")).toBe("true");
    });
    it("prevents circular reparenting into descendants", () => {
      const layers = [
        makeLayer({
          id: "p",
          name: "Parent",
          kind: "frame",
          children: [
            makeLayer({
              id: "c",
              name: "Child",
              kind: "frame",
              depth: 1,
              children: [
                makeLayer({
                  id: "gc",
                  name: "Grandchild",
                  kind: "frame",
                  depth: 2,
                }),
              ],
            }),
          ],
        }),
      ];
      const onReparentLayer = vi.fn();
      const onReorderLayer = vi.fn();
      const { container } = render(
        <LayersPanel
          layers={layers}
          selectedLayerId={null}
          onSelectLayer={() => {}}
          onReparentLayer={onReparentLayer}
          onReorderLayer={onReorderLayer}
        />,
      );
      const rowP = getRow(container, "Parent");
      const rowGC = getRow(container, "Grandchild");
      rowGC.getBoundingClientRect = () =>
        ({
          top: 100,
          bottom: 128,
          height: 28,
          left: 0,
          right: 200,
          width: 200,
        }) as DOMRect;

      const dt = mockDataTransfer();
      fireEvent.dragStart(rowP, { dataTransfer: dt });
      fireDragOver(rowGC, dt, 114);

      expect(rowGC.getAttribute("data-drop-invalid")).toBe("true");
      expect(dt.dropEffect).toBe("none");

      fireDrop(rowGC, dt);
      expect(onReparentLayer).not.toHaveBeenCalled();
      expect(onReorderLayer).not.toHaveBeenCalled();
    });

    it("calls onReorderLayer when dropped on before or after insertion lines", () => {
      const onReorderLayer = vi.fn();
      const layers = [
        makeLayer({ id: "a", name: "Layer A" }),
        makeLayer({ id: "b", name: "Layer B" }),
      ];
      const { container } = render(
        <LayersPanel
          layers={layers}
          selectedLayerId={null}
          onSelectLayer={() => {}}
          onReorderLayer={onReorderLayer}
        />,
      );
      const rowA = getRow(container, "Layer A");
      const rowB = getRow(container, "Layer B");
      rowB.getBoundingClientRect = () =>
        ({
          top: 100,
          bottom: 128,
          height: 28,
          left: 0,
          right: 200,
          width: 200,
        }) as DOMRect;

      const dt = mockDataTransfer();
      fireEvent.dragStart(rowA, { dataTransfer: dt });
      fireDragOver(rowB, dt, 105);
      fireDrop(rowB, dt);
      expect(onReorderLayer).toHaveBeenCalledWith("a", "b", "before");

      fireEvent.dragStart(rowA, { dataTransfer: dt });
      fireDragOver(rowB, dt, 125);
      fireDrop(rowB, dt);
      expect(onReorderLayer).toHaveBeenCalledWith("a", "b", "after");
    });

    it("calls onReparentLayer when dropped inside a container", () => {
      const onReparentLayer = vi.fn();
      const layers = [
        makeLayer({ id: "a", name: "Layer A" }),
        makeLayer({ id: "f1", name: "Frame 1", kind: "frame", children: [] }),
      ];
      const { container } = render(
        <LayersPanel
          layers={layers}
          selectedLayerId={null}
          onSelectLayer={() => {}}
          onReparentLayer={onReparentLayer}
        />,
      );
      const rowA = getRow(container, "Layer A");
      const rowF1 = getRow(container, "Frame 1");
      rowF1.getBoundingClientRect = () =>
        ({
          top: 100,
          bottom: 128,
          height: 28,
          left: 0,
          right: 200,
          width: 200,
        }) as DOMRect;

      const dt = mockDataTransfer();
      fireEvent.dragStart(rowA, { dataTransfer: dt });
      fireDragOver(rowF1, dt, 114);
      fireDrop(rowF1, dt);
      expect(onReparentLayer).toHaveBeenCalledWith("a", "f1", 0);
    });
  });
});
