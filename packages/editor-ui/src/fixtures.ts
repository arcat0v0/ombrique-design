import type {
  LayerNode,
  PageTab,
  SelectionSummary,
  ShellActions,
  ShellView,
} from "./types";

export function makeLayer(overrides: Partial<LayerNode> = {}): LayerNode {
  return {
    id: "layer-1",
    name: "Layer",
    tag: "div",
    kind: "frame",
    depth: 0,
    hidden: false,
    locked: false,
    generated: false,
    children: [],
    ...overrides,
  };
}

export function makeSelection(
  overrides: Partial<SelectionSummary> = {},
): SelectionSummary {
  return {
    id: "layer-1",
    name: "Layer",
    tag: "div",
    editable: true,
    styles: [],
    attrs: [],
    text: null,
    ...overrides,
  };
}

export function makeView(overrides: Partial<ShellView> = {}): ShellView {
  return {
    projectRoot: null,
    manifest: null,
    pages: [],
    activePageId: null,
    layers: [],
    selection: null,
    diagnostics: [],
    stats: null,
    canUndo: false,
    canRedo: false,
    zoom: 1,
    busy: false,
    notice: null,
    ...overrides,
  };
}

export function makeActions(
  overrides: Partial<ShellActions> = {},
): ShellActions {
  return {
    openProject: () => {},
    selectPage: () => {},
    selectLayer: () => {},
    setStyle: () => {},
    setText: () => {},
    setName: () => {},
    renameLayer: () => {},
    toggleHidden: () => {},
    toggleLocked: () => {},
    deleteSelection: () => {},
    duplicateSelection: () => {},
    groupSelection: () => {},
    ungroupSelection: () => {},
    createNode: () => {},
    undo: () => {},
    redo: () => {},
    zoomTo: () => {},
    zoomToFit: () => {},
    exportPage: () => {},
    addPage: () => {},
    renamePage: () => {},
    deletePage: () => {},
    dismissNotice: () => {},
    ...overrides,
  };
}

export function makePage(id: string, name: string): PageTab {
  return { id, name };
}
