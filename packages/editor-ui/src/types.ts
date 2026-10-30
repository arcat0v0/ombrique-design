import type { DiagnosticItem, Manifest } from "@ombrique/protocol";

export interface LayerNode {
  id: string;
  name: string;
  tag: string;
  kind: "frame" | "group" | "text" | "shape" | "vector" | "component";
  depth: number;
  hidden: boolean;
  locked: boolean;
  generated: boolean;
  children: LayerNode[];
}

export interface StyleTarget {
  source: "inline" | "shared" | "token";
  file?: string;
  start?: number;
  end?: number;
  selector?: string;
  sourceId?: string;
}

export interface StyleRow {
  key: string;
  value: string;
  source: "inline" | "shared" | "token" | "computed";
  readOnly: boolean;
  ruleLabel?: string;
  file?: string;
  start?: number;
  end?: number;
  selector?: string;
  sourceId?: string;
}

export interface TokenItem {
  name: string;
  value: string;
  file?: string;
  category?: string;
  description?: string;
}
export type CanvasTool =
  | "select"
  | "hand"
  | "frame"
  | "rect"
  | "ellipse"
  | "star"
  | "text";

export interface SelectionSummary {
  id: string;
  name: string;
  tag: string;
  kind?: "frame" | "group" | "text" | "shape" | "vector" | "component";
  componentName?: string;
  editable: boolean;
  readOnlyReason?: string;
  styles: StyleRow[];
  attrs: Array<{ key: string; value: string }>;
  text: string | null;
}

export interface CanvasStats {
  fps: number;
  visible: number;
  uploads: number;
  paints: number;
}

export interface PageTab {
  id: string;
  name: string;
}

export interface ShellView {
  projectRoot: string | null;
  manifest: Manifest | null;
  pages: PageTab[];
  activePageId: string | null;
  layers: LayerNode[];
  selection: SelectionSummary | null;
  diagnostics: DiagnosticItem[];
  stats: CanvasStats | null;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  busy: boolean;
  notice: string | null;
  activeTool?: CanvasTool;
  tokens?: TokenItem[];
}

export interface ShellActions {
  openProject: () => void;
  openExample?: () => void;
  selectPage: (pageId: string) => void;
  selectLayer: (layerId: string) => void;
  setStyle: (
    key: string,
    value: string | number | boolean | null,
    target?: StyleTarget,
  ) => void;
  refreshTokens?: () => void;
  setToken?: (name: string, value: string) => void;
  createToken?: (name: string, value: string) => void;
  setText: (text: string) => void;
  setName: (name: string) => void;
  renameLayer?: (layerId: string, name: string) => void;
  toggleHidden: () => void;
  toggleLocked: () => void;
  toggleHiddenForLayer?: (layerId: string, hidden: boolean) => void;
  toggleLockedForLayer?: (layerId: string, locked: boolean) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  groupSelection: (name: string) => void;
  ungroupSelection: () => void;
  createComponent?: (name: string) => void;
  detachInstance?: () => void;
  insertImage?: () => Promise<boolean> | undefined;
  flattenSelection?: () => Promise<boolean> | undefined;
  createNode: (
    kind: "frame" | "rect" | "ellipse" | "star" | "text" | "image",
  ) => void;
  undo: () => void;
  redo: () => void;
  zoomTo: (factor: number) => void;
  zoomToFit: () => void;
  exportPage: () => void;
  toggleFullscreen?: () => void;
  toggleDevtools?: () => void;
  reloadRenderer?: () => void;
  minimizeWindow?: () => void;
  toggleWindowMaximize?: () => void;
  closeWindow?: () => void;
  exportNode?: (
    format: "png" | "jpg" | "webp" | "svg" | "pdf",
    scale: number,
  ) => Promise<boolean> | undefined;
  bundleProject?: () => Promise<boolean> | undefined;
  openBundle?: () => Promise<boolean> | undefined;
  addPage: () => void;
  renamePage: (pageId: string, name: string) => void;
  deletePage: (pageId: string) => void;
  dismissNotice: () => void;
  setTool?: (tool: CanvasTool) => void;
  updateCanvasBounds?: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}
