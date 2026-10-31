import type {
  CommentAnchor,
  CommentThread,
  DiagnosticItem,
  ExportSetting,
  GitBranchList,
  GitCommit,
  GitStatus,
  Manifest,
} from "@ombrique/protocol";

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
  parentId?: string | null;
  ref?: {
    file: string;
    start: number;
    end: number;
    path?: number[];
  };
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
  values?: Record<string, string>;
  file?: string;
  category?: string;
  description?: string;
}
export interface TokenModeItem {
  name: string;
  isDefault: boolean;
}

export interface ComponentItem {
  name: string;
  file: string;
  frameName?: string;
  description?: string;
  axes?: Array<{ name: string; values: string[] }>;
}

export type CanvasTool =
  | "select"
  | "hand"
  | "frame"
  | "rect"
  | "ellipse"
  | "star"
  | "pen"
  | "text"
  | "comment";

export interface SelectionSummary {
  id: string;
  name: string;
  tag: string;
  kind?: "frame" | "group" | "text" | "shape" | "vector" | "component";
  componentName?: string;
  variantAxes?: Array<{ name: string; values: string[] }>;
  variantProps?: Record<string, string | number | boolean>;
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
  file?: string;
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
  tokenModes?: TokenModeItem[];
  components?: ComponentItem[];
  prototypeMode?: boolean;
  showHotspots?: boolean;
  gitStatus?: GitStatus | null;
  history?: GitCommit[];
  branches?: GitBranchList | null;
  isHistoryPreview?: boolean;
  previewCommit?: GitCommit | null;
  comments?: CommentThread[];
  activeCommentThreadId?: string | null;
  commentsTabRequest?: number;
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
  setToken?: (name: string, value: string, mode?: string) => void;
  addTokenMode?: (name: string) => void;
  renameTokenMode?: (name: string, newName: string) => void;
  deleteTokenMode?: (name: string) => void;
  createToken?: (name: string, value: string) => void;
  setText: (text: string) => void;
  setName: (name: string) => void;
  renameLayer?: (layerId: string, name: string) => void;
  toggleHidden: () => void;
  toggleLocked: () => void;
  toggleHiddenForLayer?: (layerId: string, hidden: boolean) => void;
  toggleLockedForLayer?: (layerId: string, locked: boolean) => void;
  reparentLayer?: (
    layerId: string,
    newParentId: string | null,
    index: number,
  ) => void;
  reorderLayer?: (
    layerId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  groupSelection: (name: string) => void;
  ungroupSelection: () => void;
  createComponent?: (name: string) => void;
  detachInstance?: () => void;
  insertImage?: () => Promise<boolean> | undefined;
  createComponentInstance?: (
    componentName: string,
    position?: { x: number; y: number },
  ) => void;
  createVariantSet?: (
    name: string,
    axes: Array<{ name: string; values: string[] }>,
  ) => void;
  setAttrs?: (attrs: Record<string, string | number | boolean | null>) => void;
  flattenSelection?: () => Promise<boolean> | undefined;
  createNode: (
    kind: "frame" | "rect" | "ellipse" | "star" | "pen" | "text" | "image",
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
    formatOrSettings: "png" | "jpg" | "webp" | "svg" | "pdf" | ExportSetting[],
    scale?: number,
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
  togglePrototypeMode?: () => void;
  toggleHotspots?: () => void;
  saveVersion?: (message: string) => Promise<boolean>;
  refreshHistory?: () => Promise<void>;
  previewVersion?: (commit: GitCommit) => Promise<void>;
  exitHistoryPreview?: () => Promise<void>;
  restoreVersion?: (commit: GitCommit) => Promise<void>;
  createBranch?: (branchName: string) => Promise<boolean>;
  switchBranch?: (branchName: string) => Promise<boolean>;
  refreshBranches?: () => Promise<void>;
  createCommentThread?: (thread: {
    anchor: CommentAnchor;
    author: string;
    body: string;
  }) => Promise<void>;
  replyCommentThread?: (
    threadId: string,
    message: { author: string; body: string },
  ) => Promise<void>;
  resolveCommentThread?: (threadId: string, author?: string) => Promise<void>;
  unresolveCommentThread?: (threadId: string) => Promise<void>;
  deleteCommentThread?: (threadId: string) => Promise<void>;
  deleteCommentMessage?: (threadId: string, messageId: string) => Promise<void>;
  selectCommentThread?: (threadId: string | null) => void;
}
