import type {
  CanvasTool,
  CanvasStats,
  LayerNode,
  SelectionSummary,
  ShellActions,
  ShellView,
  StyleRow,
} from "@ombrique/editor-ui";
import type {
  CommentAnchor,
  CommentThread,
  CommentsDoc,
  ComponentSummaryItem,
  DiagnosticItem,
  ExportSetting,
  GitBranchList,
  GitCommit,
  GitStatus,
  Manifest,
  TokenItem,
  TokenModeItem,
} from "@ombrique/protocol";

export interface StyleTarget {
  source?: "inline" | "shared" | "token" | "computed";
  file?: string;
  start?: number;
  end?: number;
  selector?: string;
}

export type ExtendedStyleRow = StyleRow & {
  file?: string;
  start?: number;
  end?: number;
  selector?: string;
};

export type ShellViewWithTokens = ShellView & {
  tokens: TokenItem[];
  tokenModes?: TokenModeItem[];
};

export type ShellActionsWithTokens = ShellActions & {
  setStyle: (
    key: string,
    value: string | number | boolean | null,
    target?: StyleTarget,
  ) => void;
  refreshTokens?: () => Promise<void>;
  setToken?: (name: string, value: string, mode?: string) => Promise<void>;
  addTokenMode?: (name: string) => Promise<void>;
  renameTokenMode?: (name: string, newName: string) => Promise<void>;
  deleteTokenMode?: (name: string) => Promise<void>;
  createToken?: (name: string, value: string) => Promise<void>;
  createComponent?: (name: string) => Promise<boolean>;
  detachInstance?: () => Promise<boolean>;
  createComponentInstance?: (
    componentName: string,
    position?: { x: number; y: number },
  ) => Promise<boolean>;
  insertImage?: () => Promise<boolean>;
  flattenSelection?: () => Promise<boolean>;
  exportNode?: (
    formatOrSettings: "png" | "jpg" | "webp" | "svg" | "pdf" | ExportSetting[],
    scale?: number,
  ) => Promise<boolean>;
  bundleProject?: () => Promise<boolean>;
  openBundle?: () => Promise<boolean>;
};

export interface NodeRefInfo {
  file: string;
  start: number;
  end: number;
  path?: number[];
}

export interface ResolvedNode {
  ref: NodeRefInfo;
  path: number[];
  tag: string;
  kind: string;
  generated: boolean;
  name: string | null;
  hidden: boolean;
  locked: boolean;
  text: string;
  style: Array<{
    key: string;
    value: string | number | null;
    dynamic: boolean;
  }>;
  props?: Array<{
    key: string;
    value: string | number | boolean | null;
    dynamic: boolean;
  }>;
  attrs: Array<{ key: string; value: string }>;
  sharedStyles?: Array<{
    file: string;
    selector: string;
    fullSelector: string;
    prop: string;
    value: string;
    propSpan: { start: number; end: number };
    valueSpan: { start: number; end: number };
  }>;
  componentName?: string;
  variantAxes?: Array<{ name: string; values: string[] }>;
}

export interface ShellBridge {
  openProject: () => Promise<string | null>;
  openPath: (path: string) => Promise<string>;
  send: (message: unknown) => Promise<boolean>;
  readFiles: () => Promise<Record<string, string>>;
  resolveNode: (file: string, path: number[]) => Promise<ResolvedNode | null>;
  tree: (file: string) => Promise<LayerNode[]>;
  versions: () => Promise<Record<string, string>>;
  openExample: () => Promise<string | null>;
  listTokens?: () => Promise<
    Array<{
      name: string;
      value: string;
      values?: Record<string, string>;
      file: string;
      span: { start: number; end: number };
    }>
  >;
  listTokenModes?: () => Promise<TokenModeItem[]>;
  listStyles?: () => Promise<
    Array<{
      file: string;
      selector: string;
      fullSelector: string;
      decls: Array<{
        prop: string;
        value: string;
        propSpan: { start: number; end: number };
        valueSpan: { start: number; end: number };
      }>;
    }>
  >;
  updateSharedStyle?: (
    file: string,
    start: number,
    end: number,
    value: string,
  ) => Promise<boolean>;
  setToken?: (name: string, value: string, mode?: string) => Promise<boolean>;
  createToken?: (name: string, value: string) => Promise<boolean>;
  importImage?: () => Promise<{
    ok: boolean;
    src?: string;
    width?: number;
    height?: number;
    name?: string;
  }>;
  gitStatus?: () => Promise<GitStatus>;
  gitHistory?: () => Promise<GitCommit[]>;
  gitBranches?: () => Promise<GitBranchList>;
  gitCreateBranch?: (branch: string) => Promise<boolean>;
  gitSwitchBranch?: (branch: string) => Promise<boolean>;
  gitSaveVersion?: (
    message: string,
  ) => Promise<{ hash: string; message: string }>;
  gitPreviewVersion?: (rev: string) => Promise<boolean>;
  gitExitPreview?: () => Promise<boolean>;
  gitRestoreVersion?: (rev: string) => Promise<boolean>;
  loadComments?: () => Promise<CommentsDoc>;
  saveComments?: (doc: CommentsDoc) => Promise<boolean>;
  onProject: (cb: (payload: ProjectMessage) => void) => void;
  onFiles: (cb: (payload: FilesMessage) => void) => void;
  onDoc: (cb: (payload: DocMessage) => void) => void;
  onFatal: (cb: (message: string) => void) => void;
  onStats: (cb: (stats: CanvasStats) => void) => void;
  onSelectionChanged?: (cb: (payload: unknown) => void) => void;
  onZoomChanged?: (cb: (zoom: number) => void) => void;
  onCanvasEdit?: (cb: (payload: unknown) => void) => void;
  onClipboardEdit?: (cb: (payload: unknown) => void) => void;
  onCommentPlaced?: (cb: (payload: unknown) => void) => void;
  pushComments?: (threads: CommentThread[]) => void;
  onCommentSelected?: (cb: (payload: unknown) => void) => void;
  sendResolvedProps?: (
    file: string,
    path: number[],
    info: { attrs: string[]; locked: boolean; generated: boolean },
  ) => void;
  zoomTo: (factor: number) => void;
  zoomToFit?: () => void;
  exportPage: (file: string, defaultName: string) => Promise<{ ok: boolean }>;
  exportNode?: (payload: unknown) => Promise<{ ok: boolean }>;
  bundleProject?: () => Promise<{ ok: boolean; path?: string }>;
  openBundle?: () => Promise<{ ok: boolean; root?: string }>;
  selectPage: (pageId: string) => void;
  selectLayer?: (file: string, path: number[]) => void;
  sendToolChanged?: (tool: CanvasTool) => void;
  updateCanvasBounds?: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  reloadCanvas?: () => Promise<boolean>;
  onToolChanged?: (cb: (tool: CanvasTool) => void) => void;
  minimizeWindow?: () => void;
  toggleWindowMaximize?: () => void;
  closeWindow?: () => void;
  toggleFullscreen?: () => void;
  toggleDevtools?: () => void;
  reloadRenderer?: () => void;
  sendPrototypeMode?: (active: boolean) => void;
  sendShowHotspots?: (show: boolean) => void;
  onPrototypeModeChanged?: (cb: (active: boolean) => void) => void;
  onPageChanged?: (cb: (pageId: string) => void) => void;
}

interface ProjectMessage {
  root: string;
  manifest: Manifest;
  files: Record<string, string>;
  components?: ComponentSummaryItem[];
}

interface FilesMessage {
  files: Record<string, string>;
  manifest?: Manifest;
  components?: ComponentSummaryItem[];
}

interface DocMessage {
  kind: string;
  message?: string;
  items?: DiagnosticItem[];
  canUndo?: boolean;
  canRedo?: boolean;
  transaction?: { changedFiles: string[] };
  manifest?: Manifest;
}

export const FRAME_LAYOUT_PROPS: ReadonlySet<string> = new Set([
  "layout",
  "gap",
  "padding",
  "align",
  "justify",
  "wrap",
  "grid",
  "mode",
]);

export const FRAME_PROTOTYPE_PROPS: Record<string, true> = {
  onClickNavigate: true,
  cursor: true,
  transitionType: true,
  transitionDuration: true,
  onHoverStyle: true,
};

export const SHAPE_APPEARANCE_PROPS: Record<string, true> = {
  fill: true,
  stroke: true,
  strokeWidth: true,
  opacity: true,
};

export function shouldRouteToAttrs(
  key: string,
  isProp: boolean,
  tag: string,
): boolean {
  if (isProp) return true;
  const t = tag.toLowerCase();
  const isShape = t === "rect" || t === "ellipse" || t === "star";
  if (isShape && SHAPE_APPEARANCE_PROPS[key]) return true;
  const isFrameLike = t === "frame" || t === "section" || t === "group";
  return (
    isFrameLike &&
    (FRAME_LAYOUT_PROPS.has(key) || Boolean(FRAME_PROTOTYPE_PROPS[key]))
  );
}

const INITIAL: ShellViewWithTokens = {
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
  activeTool: "select",
  tokens: [],
  prototypeMode: false,
  showHotspots: false,
  gitStatus: null,
  history: [],
  branches: null,
  isHistoryPreview: false,
  previewCommit: null,
  comments: [],
  activeCommentThreadId: null,
};

export function toSummary(node: ResolvedNode): SelectionSummary {
  const classifySource = (val: string): "inline" | "token" | "shared" => {
    if (val.startsWith("var(--") || val.includes("theme.")) return "token";
    if (val.startsWith("@") || val.startsWith("$")) return "shared";
    return "inline";
  };
  const styles: StyleRow[] = [
    ...(node.props ?? []).map((prop) => {
      const strVal = prop.value === null ? "" : String(prop.value);
      const src = classifySource(strVal);
      return {
        key: prop.key,
        value: strVal,
        source: src,
        readOnly: prop.dynamic,
        ruleLabel: src === "token" ? "Design Token" : undefined,
      };
    }),
    ...node.style.map((prop) => {
      const strVal = prop.value === null ? "" : String(prop.value);
      const src = classifySource(strVal);
      return {
        key: prop.key,
        value: strVal,
        source: src,
        readOnly: prop.dynamic,
        ruleLabel: src === "token" ? "Design Token" : undefined,
      };
    }),
    ...(node.sharedStyles ?? []).map((shared) => ({
      key: shared.prop,
      value: shared.value,
      source: "shared" as const,
      readOnly: false,
      ruleLabel: `${shared.file}:${shared.selector}`,
      file: shared.file,
      start: shared.valueSpan.start,
      end: shared.valueSpan.end,
      selector: shared.selector,
    })),
  ];
  const tagLower = node.tag.toLowerCase();
  const isDisplayContents = node.style.some(
    (s) => s.key === "display" && s.value === "contents",
  );
  const derivedKind: SelectionSummary["kind"] =
    node.kind === "component" || node.componentName
      ? "component"
      : node.kind === "group" || tagLower === "group" || isDisplayContents
        ? "group"
        : tagLower === "frame" || tagLower === "section"
          ? "frame"
          : node.text && node.text.length > 0
            ? "text"
            : undefined;
  const compName =
    node.componentName ?? (node.kind === "component" ? node.tag : undefined);
  const variantProps: Record<string, string | number | boolean> = {};
  for (const p of node.props ?? []) {
    if (p.value !== null) variantProps[p.key] = p.value;
  }
  return {
    id: node.path.join("/"),
    name: node.name ?? node.tag,
    tag: node.tag,
    kind: derivedKind,
    componentName: compName,
    variantAxes: node.variantAxes,
    variantProps,
    editable: !node.generated,
    readOnlyReason: node.generated
      ? "该节点由代码生成，请在代码中修改"
      : undefined,
    styles,
    attrs: node.attrs,
    text: node.text.trim().length > 0 ? node.text : null,
  };
}

export function createShellState() {
  const bridge = (window as unknown as { ombriqueShell?: ShellBridge })
    .ombriqueShell;
  let view: ShellViewWithTokens = INITIAL;
  let files: Record<string, string> = {};
  let selected: ResolvedNode | null = null;
  let clipboard: ResolvedNode[] = [];
  let multiSelectionPaths: Array<{ file: string; path: number[] }> = [];
  const listeners = new Set<(next: ShellViewWithTokens) => void>();

  function set(patch: Partial<ShellViewWithTokens>) {
    view = { ...view, ...patch };
    for (const listener of listeners) listener(view);
  }

  function pushComments(threads: CommentThread[]) {
    bridge?.pushComments?.(threads);
  }

  function pageFileOf(pageId: string): string | null {
    const page = view.manifest?.pages.find((entry) => entry.id === pageId);
    return page?.file ?? null;
  }

  function _findLayerByPath(
    layers: LayerNode[],
    path: number[],
  ): LayerNode | null {
    const key = path.join("/");
    for (const root of layers) {
      if (root.id === key) return root;
      const stack = [...root.children];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        if (node.id === key) return node;
        stack.push(...node.children);
      }
    }
    return null;
  }
  function findLayerNode(layers: LayerNode[], id: string): LayerNode | null {
    for (const layer of layers) {
      if (layer.id === id) return layer;
      if (layer.children.length > 0) {
        const found = findLayerNode(layer.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function toRef(node: ResolvedNode) {
    return {
      file: node.ref.file,
      start: node.ref.start,
      end: node.ref.end,
      path: node.path,
    };
  }

  async function refreshTokens() {
    if (!bridge?.listTokens) return;
    try {
      const [tokens, tokenModes] = await Promise.all([
        bridge.listTokens(),
        bridge.listTokenModes?.(),
      ]);
      set({
        tokens: (tokens ?? []).map((token) => ({
          ...token,
          values: token.values ?? {},
        })),
        tokenModes: tokenModes ?? [{ name: "default", isDefault: true }],
      });
    } catch {
      // non-blocking
    }
  }

  async function refreshLayers(pageId: string) {
    const file = pageFileOf(pageId);
    if (!file || !bridge) return;
    const layers = await bridge.tree(file);
    set({ layers });
  }

  async function selectNode(file: string, path: number[]) {
    if (!bridge) return;
    const node = await bridge.resolveNode(file, path);
    if (!node) {
      selected = null;
      set({ selection: null, notice: "该节点已不在当前源码中" });
      return;
    }
    selected = node;
    set({ selection: toSummary(node) });
    const attrKeys = (node.props ?? [])
      .filter(
        (prop) =>
          prop.key === "x" ||
          prop.key === "y" ||
          prop.key === "width" ||
          prop.key === "height",
      )
      .map((prop) => prop.key);
    bridge.sendResolvedProps?.(file, path, {
      attrs: attrKeys,
      locked: node.locked,
      generated: node.generated,
    });
  }

  let editQueue: Promise<void> = Promise.resolve();

  async function sendCommands(commands: unknown[]) {
    const run = async () => {
      if (!bridge) return;
      set({ busy: true });
      const versions = await bridge.versions();
      try {
        await bridge.send({
          kind: "applyCommands",
          commands,
          baseVersions: Object.values(versions),
        });
      } catch (error) {
        set({
          notice: error instanceof Error ? error.message : String(error),
          busy: false,
        });
        return;
      }
      set({ busy: false });
    };
    const queued = editQueue.then(run, run);
    editQueue = queued.catch(() => {});
    await queued;
  }

  async function applyTokenMode(command: {
    kind: "addTokenMode" | "renameTokenMode" | "deleteTokenMode";
    name: string;
    newName?: string;
  }) {
    if (!bridge) return;
    try {
      const versions = await bridge.versions();
      const ok = await bridge.send({
        kind: "applyCommands",
        commands: [command],
        baseVersions: Object.values(versions),
      });
      if (!ok) {
        set({ notice: `更新变量模式失败: ${command.name}` });
        return;
      }
      await refreshTokens();
      if (selected) await selectNode(selected.ref.file, selected.path);
    } catch (error) {
      set({
        notice: `更新变量模式失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const actions: ShellActionsWithTokens = {
    openProject: () => {
      void bridge?.openProject();
    },
    selectPage: (pageId) => {
      set({ activePageId: pageId, selection: null, layers: [] });
      selected = null;
      bridge?.selectPage(pageId);
      void refreshLayers(pageId);
    },
    selectLayer: (layerId) => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file) return;
      const path = layerId.split("/").map(Number);
      void selectNode(file, path);
      bridge?.selectLayer?.(file, path);
    },
    setStyle: (key, value, target?: StyleTarget) => {
      if (target?.source === "shared") {
        if (
          !target.file ||
          target.start === undefined ||
          target.end === undefined
        ) {
          set({ notice: "缺少共享样式源位置信息" });
          return;
        }
        const { file, start, end } = target;
        if (!file || start === undefined || end === undefined) {
          set({ notice: "缺少共享样式源位置信息" });
          return;
        }
        void (async () => {
          if (!bridge?.updateSharedStyle) return;
          try {
            const ok = await bridge.updateSharedStyle(
              file,
              start,
              end,
              String(value ?? ""),
            );
            if (!ok) {
              set({ notice: "修改共享样式失败" });
              return;
            }
            if (view.activePageId) void refreshLayers(view.activePageId);
            if (selected) void selectNode(selected.ref.file, selected.path);
            void refreshTokens();
          } catch (error) {
            set({
              notice: `修改共享样式失败: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        })();
        return;
      }

      if (!selected) return;
      const isProp = (selected.props ?? []).some((prop) => prop.key === key);
      const useAttrs = shouldRouteToAttrs(key, isProp, selected.tag);
      if (useAttrs) {
        void sendCommands([
          {
            kind: "setAttrs",
            target: toRef(selected),
            attrs: { [key]: value },
          },
        ]);
        return;
      }
      void sendCommands([
        {
          kind: "setStyle",
          target: toRef(selected),
          declarations: [[key, value]],
        },
      ]);
    },
    refreshTokens: async () => {
      await refreshTokens();
    },
    addTokenMode: async (name) =>
      applyTokenMode({ kind: "addTokenMode", name }),
    renameTokenMode: async (name, newName) =>
      applyTokenMode({ kind: "renameTokenMode", name, newName }),
    deleteTokenMode: async (name) =>
      applyTokenMode({ kind: "deleteTokenMode", name }),
    setToken: async (name: string, value: string, mode?: string) => {
      if (!bridge?.setToken) return;
      try {
        const ok =
          mode === undefined
            ? await bridge.setToken(name, value)
            : await bridge.setToken(name, value, mode);
        if (!ok) {
          set({ notice: `更新 Token 失败: ${name}` });
          return;
        }
        await refreshTokens();
        if (selected) void selectNode(selected.ref.file, selected.path);
      } catch (error) {
        set({
          notice: `更新 Token 失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    createToken: async (name: string, value: string) => {
      if (!bridge?.createToken) return;
      try {
        const ok = await bridge.createToken(name, value);
        if (!ok) {
          set({ notice: `创建 Token 失败: ${name}` });
          return;
        }
        await refreshTokens();
        if (selected) void selectNode(selected.ref.file, selected.path);
      } catch (error) {
        set({
          notice: `创建 Token 失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    createComponent: async (name: string): Promise<boolean> => {
      if (!selected) return false;
      try {
        await sendCommands([
          {
            kind: "createComponent",
            target: toRef(selected),
            name,
          },
        ]);
        if (view.activePageId) void refreshLayers(view.activePageId);
        if (selected) void selectNode(selected.ref.file, selected.path);
        return true;
      } catch (error) {
        set({
          notice: `创建组件失败: ${error instanceof Error ? error.message : String(error)}`,
        });
        return false;
      }
    },
    detachInstance: async (): Promise<boolean> => {
      if (!selected) return false;
      try {
        await sendCommands([
          {
            kind: "detachInstance",
            target: toRef(selected),
          },
        ]);
        if (view.activePageId) void refreshLayers(view.activePageId);
        if (selected) void selectNode(selected.ref.file, selected.path);
        return true;
      } catch (error) {
        set({
          notice: `分离组件失败: ${error instanceof Error ? error.message : String(error)}`,
        });
        return false;
      }
    },
    createComponentInstance: async (
      componentName: string,
      position?: { x: number; y: number },
    ): Promise<boolean> => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return false;
      try {
        const isFrameTag =
          selected !== null &&
          (selected.tag.toLowerCase() === "frame" ||
            selected.tag.toLowerCase() === "section");
        const parent =
          isFrameTag && selected
            ? { ...toRef(selected), path: selected.path }
            : null;
        const x = position?.x ?? 40;
        const y = position?.y ?? 40;
        const spec = {
          kind: "component" as const,
          componentName,
          name: componentName,
          x,
          y,
        };
        await sendCommands([
          {
            kind: "createNodes",
            parent,
            pageFile: file,
            index: 0,
            specs: [spec],
          },
        ]);
        if (view.activePageId) void refreshLayers(view.activePageId);
        return true;
      } catch (error) {
        set({
          notice: `插入组件实例失败: ${error instanceof Error ? error.message : String(error)}`,
        });
        return false;
      }
    },
    insertImage: async (): Promise<boolean> => {
      if (!bridge?.importImage) return false;
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file) return false;
      try {
        const res = await bridge.importImage();
        if (!res.ok || !res.src) return false;
        const isFrameTag =
          selected !== null &&
          (selected.tag.toLowerCase() === "frame" ||
            selected.tag.toLowerCase() === "section");
        const parent =
          isFrameTag && selected
            ? { ...toRef(selected), path: selected.path }
            : null;
        const propNum = (key: string): number | null => {
          const value = (selected?.props ?? []).find(
            (prop) => prop.key === key,
          )?.value;
          return typeof value === "number" ? value : null;
        };
        const selX = propNum("x") ?? propNum("left") ?? 40;
        const selY = propNum("y") ?? propNum("top") ?? 40;
        const selW = propNum("width") ?? 160;
        const x = isFrameTag ? 24 : parent ? selX + selW + 40 : 40;
        const y = isFrameTag ? 24 : parent ? selY : 40;
        const width = res.width ?? 400;
        const height = res.height ?? 300;
        const name = res.name ?? "Image";

        await sendCommands([
          {
            kind: "createNodes",
            parent,
            pageFile: file,
            index: 0,
            specs: [
              {
                kind: "image",
                name,
                src: res.src,
                x,
                y,
                width,
                height,
                radius: 0,
              },
            ],
          },
        ]);
        if (view.activePageId) void refreshLayers(view.activePageId);
        return true;
      } catch (error) {
        set({
          notice: `导入图片失败: ${error instanceof Error ? error.message : String(error)}`,
        });
        return false;
      }
    },
    flattenSelection: async (): Promise<boolean> => {
      if (!selected) return false;
      try {
        await sendCommands([
          {
            kind: "flattenBoolean",
            target: toRef(selected),
          },
        ]);
        if (view.activePageId) void refreshLayers(view.activePageId);
        if (selected) void selectNode(selected.ref.file, selected.path);
        return true;
      } catch (error) {
        set({
          notice: `合并矢量失败: ${error instanceof Error ? error.message : String(error)}`,
        });
        return false;
      }
    },
    setText: (text) => {
      if (!selected) return;
      void sendCommands([{ kind: "setText", target: toRef(selected), text }]);
    },
    setName: (name) => {
      if (!selected) return;
      const hasNameProp = (selected.props ?? []).some(
        (prop) => prop.key === "name",
      );
      if (hasNameProp) {
        void sendCommands([
          {
            kind: "setAttrs",
            target: toRef(selected),
            attrs: { name },
          },
        ]);
        return;
      }
      void sendCommands([
        {
          kind: "setAttrs",
          target: toRef(selected),
          attrs: { "data-name": name },
        },
      ]);
    },
    toggleHidden: () => {
      if (!selected) return;
      void sendCommands([
        {
          kind: "setAttrs",
          target: toRef(selected),
          attrs: { hidden: !selected.hidden },
        },
      ]);
    },
    toggleLocked: () => {
      if (!selected) return;
      void sendCommands([
        {
          kind: "setAttrs",
          target: toRef(selected),
          attrs: { "data-locked": selected.locked ? null : "" },
        },
      ]);
    },
    deleteSelection: () => {
      if (!selected) return;
      void sendCommands([{ kind: "deleteNodes", targets: [toRef(selected)] }]);
      selected = null;
      set({ selection: null });
    },
    duplicateSelection: () => {
      if (!selected) return;
      void sendCommands([
        {
          kind: "duplicateNode",
          target: toRef(selected),
          dx: 20,
          dy: 20,
        },
      ]);
    },
    groupSelection: (name) => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge || !selected) return;
      if (multiSelectionPaths.length === 0) return;
      void (async () => {
        const targets: Array<{
          file: string;
          start: number;
          end: number;
          path: number[];
        }> = [];
        for (const entry of multiSelectionPaths) {
          const node = await bridge.resolveNode(entry.file, entry.path);
          if (!node) {
            set({ notice: "该节点已不在当前源码中" });
            return;
          }
          targets.push(toRef(node));
        }
        const files = new Set(targets.map((target) => target.file));
        if (files.size > 1) {
          set({ notice: "只能编组同一文件中的节点" });
          return;
        }
        const primary = targets.find(
          (target) => target.path.join("/") === selected?.path.join("/"),
        );
        const parentPath =
          primary && primary.path.length > 1 ? primary.path.slice(0, -1) : null;
        let parent: {
          file: string;
          start: number;
          end: number;
          path: number[];
        } | null = null;
        if (parentPath) {
          const parentNode = await bridge.resolveNode(file, parentPath);
          if (!parentNode) {
            set({ notice: "父节点已不在当前源码中" });
            return;
          }
          parent = toRef(parentNode);
        }
        const minIndex = targets.reduce(
          (min, target) =>
            Math.min(min, target.path[target.path.length - 1] ?? 0),
          Number.POSITIVE_INFINITY,
        );
        await sendCommands([
          {
            kind: "groupNodes",
            targets,
            parent,
            pageFile: file,
            index: Number.isFinite(minIndex) ? minIndex : 0,
            name,
          },
        ]);
      })();
    },
    ungroupSelection: () => {
      if (!selected) return;
      void sendCommands([{ kind: "ungroupNode", target: toRef(selected) }]);
    },
    createNode: (kind) => {
      if (kind === "pen") {
        actions.setTool?.("pen");
        return;
      }
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return;
      const isFrameTag =
        selected !== null &&
        (selected.tag.toLowerCase() === "frame" ||
          selected.tag.toLowerCase() === "section");
      const parent =
        isFrameTag && selected
          ? { ...toRef(selected), path: selected.path }
          : null;
      const propNum = (key: string): number | null => {
        const value = (selected?.props ?? []).find(
          (prop) => prop.key === key,
        )?.value;
        return typeof value === "number" ? value : null;
      };
      const selX = propNum("x") ?? propNum("left") ?? 40;
      const selY = propNum("y") ?? propNum("top") ?? 40;
      const selW = propNum("width") ?? 160;
      const x = isFrameTag ? 24 : parent ? selX + selW + 40 : 40;
      const y = isFrameTag ? 24 : parent ? selY : 40;
      const spec =
        kind === "text"
          ? { kind, text: "Text", x, y, width: 240 }
          : {
              kind,
              name: kind,
              x,
              y,
              width: kind === "frame" ? 480 : 160,
              height: kind === "frame" ? 320 : 160,
              fill: "#d9d9d9",
            };
      void sendCommands([
        {
          kind: "createNodes",
          parent,
          pageFile: file,
          index: 0,
          specs: [spec],
        },
      ]);
    },
    undo: () => {
      void bridge?.send({ kind: "undo" })?.then(() => {
        void refreshTokens();
        if (selected) void selectNode(selected.ref.file, selected.path);
      });
    },
    redo: () => {
      void bridge?.send({ kind: "redo" })?.then(() => {
        void refreshTokens();
        if (selected) void selectNode(selected.ref.file, selected.path);
      });
    },
    zoomTo: (factor) => {
      bridge?.zoomTo(factor);
    },
    exportPage: () => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return;
      const name =
        file
          .split("/")
          .pop()
          ?.replace(/\.tsx$/, "") ?? "page";
      void bridge.exportPage(file, `${name}.png`).then((result) => {
        if (!result.ok) set({ notice: "导出失败" });
      });
    },
    exportNode: async (
      formatOrSettings:
        | "png"
        | "jpg"
        | "webp"
        | "svg"
        | "pdf"
        | ExportSetting[],
      scale = 2,
    ): Promise<boolean> => {
      const file = selected
        ? selected.ref.file
        : view.activePageId
          ? pageFileOf(view.activePageId)
          : null;
      if (!file || !bridge?.exportNode) return false;
      const baseName =
        selected?.name ??
        file
          .split("/")
          .pop()
          ?.replace(/\.tsx$/, "") ??
        "export";

      if (Array.isArray(formatOrSettings)) {
        let settings = formatOrSettings;
        if (settings.length === 0) {
          settings = [
            {
              id: "default",
              format: "png",
              scale: { type: "scale", value: 1 },
              suffix: "",
            },
          ];
        }
        try {
          const res = await bridge.exportNode({
            file,
            path: selected?.path,
            name: baseName,
            settings,
            format: settings[0]?.format ?? "png",
            scale: 1,
            defaultName: `${baseName}.${settings[0]?.format ?? "png"}`,
          });
          if (!res.ok) set({ notice: "导出失败" });
          return res.ok;
        } catch (e) {
          set({
            notice: `导出失败: ${e instanceof Error ? e.message : String(e)}`,
          });
          return false;
        }
      }

      const format = formatOrSettings;
      const defaultName = `${baseName}.${format}`;
      try {
        const res = await bridge.exportNode({
          file,
          path: selected?.path,
          format,
          scale,
          defaultName,
          name: baseName,
          settings: [
            {
              id: "single",
              format,
              scale: { type: "scale", value: scale },
              suffix: "",
            },
          ],
        });
        if (!res.ok) set({ notice: `导出 ${format.toUpperCase()} 失败` });
        return res.ok;
      } catch (e) {
        set({
          notice: `导出 ${format.toUpperCase()} 失败: ${e instanceof Error ? e.message : String(e)}`,
        });
        return false;
      }
    },
    bundleProject: async (): Promise<boolean> => {
      if (!bridge?.bundleProject) return false;
      try {
        const res = await bridge.bundleProject();
        if (!res.ok) set({ notice: "打包项目失败" });
        return res.ok;
      } catch (e) {
        set({
          notice: `打包项目失败: ${e instanceof Error ? e.message : String(e)}`,
        });
        return false;
      }
    },
    openBundle: async (): Promise<boolean> => {
      if (!bridge?.openBundle) return false;
      try {
        const res = await bridge.openBundle();
        if (!res.ok) set({ notice: "打开项目包失败" });
        return res.ok;
      } catch (e) {
        set({
          notice: `打开项目包失败: ${e instanceof Error ? e.message : String(e)}`,
        });
        return false;
      }
    },
    zoomToFit: () => {
      bridge?.zoomToFit?.();
    },
    minimizeWindow: () => {
      bridge?.minimizeWindow?.();
    },
    toggleWindowMaximize: () => {
      bridge?.toggleWindowMaximize?.();
    },
    closeWindow: () => {
      bridge?.closeWindow?.();
    },
    toggleFullscreen: () => {
      bridge?.toggleFullscreen?.();
    },
    toggleDevtools: () => {
      bridge?.toggleDevtools?.();
    },
    reloadRenderer: () => {
      bridge?.reloadRenderer?.();
    },
    addPage: () => {
      void sendCommands([
        { kind: "addPage", name: `Page ${view.pages.length + 1}` },
      ]);
    },
    renamePage: (pageId, name) => {
      void sendCommands([{ kind: "renamePage", pageId, name }]);
    },
    deletePage: (pageId) => {
      const remaining = view.pages.filter((page) => page.id !== pageId);
      if (remaining.length === 0) {
        set({ notice: "至少保留一个页面" });
        return;
      }
      void sendCommands([{ kind: "deletePage", pageId }]).then(() => {
        if (view.activePageId === pageId) {
          const next = remaining[0];
          if (next) {
            set({ activePageId: next.id, selection: null, layers: [] });
            selected = null;
            bridge?.selectPage(next.id);
            void refreshLayers(next.id);
          }
        }
      });
    },
    renameLayer: (layerId, name) => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return;
      const path = layerId.split("/").map(Number);
      void (async () => {
        const node = await bridge.resolveNode(file, path);
        if (!node) {
          set({ notice: "该节点已不在当前源码中" });
          return;
        }
        const hasNameProp = (node.props ?? []).some(
          (prop) => prop.key === "name",
        );
        await sendCommands([
          {
            kind: "setAttrs",
            target: toRef(node),
            attrs: hasNameProp ? { name } : { "data-name": name },
          },
        ]);
      })();
    },
    toggleHiddenForLayer: (layerId, hidden) => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return;
      const path = layerId.split("/").map(Number);
      void (async () => {
        const node = await bridge.resolveNode(file, path);
        if (!node) return;
        await sendCommands([
          { kind: "setAttrs", target: toRef(node), attrs: { hidden } },
        ]);
      })();
    },
    toggleLockedForLayer: (layerId, locked) => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return;
      const path = layerId.split("/").map(Number);
      void (async () => {
        const node = await bridge.resolveNode(file, path);
        if (!node) return;
        await sendCommands([
          {
            kind: "setAttrs",
            target: toRef(node),
            attrs: { "data-locked": locked ? "" : null },
          },
        ]);
      })();
    },
    reparentLayer: (layerId, newParentId, index) => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return;
      void (async () => {
        try {
          let targetRef: NodeRefInfo | null =
            findLayerNode(view.layers, layerId)?.ref ?? null;
          if (!targetRef) {
            const targetNode = await bridge.resolveNode(
              file,
              layerId.split("/").map(Number),
            );
            if (!targetNode) {
              set({ notice: "目标节点已不在当前源码中" });
              return;
            }
            targetRef = toRef(targetNode);
          }

          let parentRef: NodeRefInfo | null = null;
          if (newParentId !== null) {
            parentRef = findLayerNode(view.layers, newParentId)?.ref ?? null;
            if (!parentRef) {
              const parentNode = await bridge.resolveNode(
                file,
                newParentId.split("/").map(Number),
              );
              if (!parentNode) {
                set({ notice: "父节点已不在当前源码中" });
                return;
              }
              parentRef = toRef(parentNode);
            }
          }

          await sendCommands([
            {
              kind: "reparent",
              target: targetRef,
              parent: parentRef,
              pageFile: file,
              index: Math.max(0, index),
            },
          ]);
          if (view.activePageId) void refreshLayers(view.activePageId);
        } catch (error) {
          set({
            notice: `重新归属父级失败: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      })();
    },
    reorderLayer: (layerId, targetId, position) => {
      const file = view.activePageId ? pageFileOf(view.activePageId) : null;
      if (!file || !bridge) return;
      void (async () => {
        try {
          const findNodeAndParent = (
            nodes: LayerNode[],
            id: string,
            parent: LayerNode | null = null,
          ): {
            node: LayerNode;
            parent: LayerNode | null;
            siblings: LayerNode[];
          } | null => {
            for (const node of nodes) {
              if (node.id === id) {
                return { node, parent, siblings: nodes };
              }
              if (node.children.length > 0) {
                const found = findNodeAndParent(node.children, id, node);
                if (found) return found;
              }
            }
            return null;
          };

          const targetInfo = findNodeAndParent(view.layers, targetId);
          let newParentId: string | null = null;
          let calculatedIndex = 0;

          if (targetInfo) {
            newParentId = targetInfo.parent ? targetInfo.parent.id : null;
            const siblingsExcludingDragged = targetInfo.siblings.filter(
              (s) => s.id !== layerId,
            );
            const targetIndex = siblingsExcludingDragged.findIndex(
              (s) => s.id === targetId,
            );
            calculatedIndex =
              position === "before"
                ? Math.max(0, targetIndex)
                : targetIndex >= 0
                  ? targetIndex + 1
                  : siblingsExcludingDragged.length;
          } else {
            const targetPath = targetId.split("/").map(Number);
            if (targetPath.length > 1) {
              newParentId = targetPath.slice(0, -1).join("/");
              const lastIdx = targetPath[targetPath.length - 1] ?? 0;
              calculatedIndex = position === "before" ? lastIdx : lastIdx + 1;
            } else {
              newParentId = null;
              const lastIdx = targetPath[0] ?? 0;
              calculatedIndex = position === "before" ? lastIdx : lastIdx + 1;
            }
          }

          let targetRef: NodeRefInfo | null =
            findLayerNode(view.layers, layerId)?.ref ?? null;
          if (!targetRef) {
            const draggedNode = await bridge.resolveNode(
              file,
              layerId.split("/").map(Number),
            );
            if (!draggedNode) {
              set({ notice: "拖拽节点已不在当前源码中" });
              return;
            }
            targetRef = toRef(draggedNode);
          }

          let parentRef: NodeRefInfo | null = null;
          if (newParentId !== null) {
            parentRef = findLayerNode(view.layers, newParentId)?.ref ?? null;
            if (!parentRef) {
              const parentNode = await bridge.resolveNode(
                file,
                newParentId.split("/").map(Number),
              );
              if (!parentNode) {
                set({ notice: "父节点已不在当前源码中" });
                return;
              }
              parentRef = toRef(parentNode);
            }
          }

          await sendCommands([
            {
              kind: "reparent",
              target: targetRef,
              parent: parentRef,
              pageFile: file,
              index: calculatedIndex,
            },
          ]);
          if (view.activePageId) void refreshLayers(view.activePageId);
        } catch (error) {
          set({
            notice: `重新排列图层失败: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      })();
    },
    updateCanvasBounds: (bounds) => {
      bridge?.updateCanvasBounds?.(bounds);
    },
    setTool: (tool) => {
      set({ activeTool: tool });
      bridge?.sendToolChanged?.(tool);
    },
    setAttrs: (attrs) => {
      if (!selected) return;
      void sendCommands([
        {
          kind: "setAttrs",
          target: toRef(selected),
          attrs,
        },
      ]);
    },
    togglePrototypeMode: () => {
      const next = !view.prototypeMode;
      set({ prototypeMode: next });
      bridge?.sendPrototypeMode?.(next);
    },
    toggleHotspots: () => {
      const next = !view.showHotspots;
      set({ showHotspots: next });
      bridge?.sendShowHotspots?.(next);
    },
    dismissNotice: () => set({ notice: null }),
    saveVersion: async (message: string) => {
      if (!bridge?.gitSaveVersion) return false;
      try {
        await bridge.gitSaveVersion(message);
        if (bridge.gitHistory) {
          const history = await bridge.gitHistory();
          set({ history });
        }
        if (bridge.gitStatus) {
          const gitStatus = await bridge.gitStatus();
          set({ gitStatus });
        }
        return true;
      } catch (err) {
        set({
          notice: `保存版本失败: ${err instanceof Error ? err.message : String(err)}`,
        });
        return false;
      }
    },
    refreshHistory: async () => {
      if (bridge?.gitHistory) {
        const history = await bridge.gitHistory();
        set({ history });
      }
      if (bridge?.gitStatus) {
        const gitStatus = await bridge.gitStatus();
        set({ gitStatus });
      }
    },
    previewVersion: async (commit: GitCommit) => {
      if (!bridge?.gitPreviewVersion) return;
      await bridge.gitPreviewVersion(commit.hash);
      set({ isHistoryPreview: true, previewCommit: commit });
    },
    exitHistoryPreview: async () => {
      if (!bridge?.gitExitPreview) return;
      await bridge.gitExitPreview();
      set({ isHistoryPreview: false, previewCommit: null });
    },
    restoreVersion: async (commit: GitCommit) => {
      if (!bridge?.gitRestoreVersion) return;
      await bridge.gitRestoreVersion(commit.hash);
      set({ isHistoryPreview: false, previewCommit: null });
    },
    createBranch: async (branchName: string) => {
      if (!bridge?.gitCreateBranch) return false;
      try {
        await bridge.gitCreateBranch(branchName);
        if (bridge.gitBranches) {
          const branches = await bridge.gitBranches();
          set({ branches });
        }
        return true;
      } catch (err) {
        set({
          notice: `创建分支失败: ${err instanceof Error ? err.message : String(err)}`,
        });
        return false;
      }
    },
    switchBranch: async (branchName: string) => {
      if (!bridge?.gitSwitchBranch) return false;
      try {
        await bridge.gitSwitchBranch(branchName);
        if (bridge.gitBranches) {
          const branches = await bridge.gitBranches();
          set({ branches });
        }
        return true;
      } catch (err) {
        set({
          notice: `切换分支失败: ${err instanceof Error ? err.message : String(err)}`,
        });
        return false;
      }
    },
    refreshBranches: async () => {
      if (bridge?.gitBranches) {
        const branches = await bridge.gitBranches();
        set({ branches });
      }
    },
    createCommentThread: async (input) => {
      const current = view.comments ?? [];
      const now = new Date().toISOString();
      const thread: CommentThread = {
        id: `thread_${Date.now()}`,
        anchor: input.anchor,
        messages: [
          {
            id: `msg_${Date.now()}`,
            author: input.author,
            body: input.body,
            createdAt: now,
          },
        ],
        resolved: false,
        createdAt: now,
        updatedAt: now,
      };
      const nextComments = [...current, thread];
      set({
        comments: nextComments,
        activeCommentThreadId: thread.id,
        commentsTabRequest: (view.commentsTabRequest ?? 0) + 1,
      });
      pushComments(nextComments);
      await bridge?.saveComments?.({ version: 1, threads: nextComments });
    },
    replyCommentThread: async (threadId, message) => {
      const current = view.comments ?? [];
      const now = new Date().toISOString();
      const nextComments = current.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          messages: [
            ...t.messages,
            {
              id: `msg_${Date.now()}`,
              author: message.author,
              body: message.body,
              createdAt: now,
            },
          ],
          updatedAt: now,
        };
      });
      set({ comments: nextComments });
      pushComments(nextComments);
      await bridge?.saveComments?.({ version: 1, threads: nextComments });
    },
    resolveCommentThread: async (threadId, author) => {
      const current = view.comments ?? [];
      const now = new Date().toISOString();
      const nextComments = current.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          resolved: true,
          resolvedAt: now,
          resolvedBy: author,
          updatedAt: now,
        };
      });
      set({ comments: nextComments });
      pushComments(nextComments);
      await bridge?.saveComments?.({ version: 1, threads: nextComments });
    },
    unresolveCommentThread: async (threadId) => {
      const current = view.comments ?? [];
      const now = new Date().toISOString();
      const nextComments = current.map((t) => {
        if (t.id !== threadId) return t;
        const { resolvedAt: _, resolvedBy: __, ...rest } = t;
        return { ...rest, resolved: false, updatedAt: now };
      });
      set({ comments: nextComments });
      pushComments(nextComments);
      await bridge?.saveComments?.({ version: 1, threads: nextComments });
    },
    deleteCommentThread: async (threadId) => {
      const current = view.comments ?? [];
      const nextComments = current.filter((t) => t.id !== threadId);
      set({
        comments: nextComments,
        activeCommentThreadId:
          view.activeCommentThreadId === threadId
            ? null
            : view.activeCommentThreadId,
      });
      pushComments(nextComments);
      await bridge?.saveComments?.({ version: 1, threads: nextComments });
    },
    deleteCommentMessage: async (threadId, messageId) => {
      const current = view.comments ?? [];
      const nextComments = current
        .map((t) => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: t.messages.filter((m) => m.id !== messageId),
          };
        })
        .filter((t) => t.messages.length > 0);
      set({ comments: nextComments });
      pushComments(nextComments);
      await bridge?.saveComments?.({ version: 1, threads: nextComments });
    },
    selectCommentThread: (threadId) => {
      set({ activeCommentThreadId: threadId });
    },
  };

  function applyProject(message: ProjectMessage) {
    files = message.files;
    const pages = message.manifest.pages.map((page) => ({
      id: page.id,
      name: page.name,
      file: page.file,
    }));
    const activePageId =
      view.activePageId && pages.some((p) => p.id === view.activePageId)
        ? view.activePageId
        : (pages[0]?.id ?? null);
    selected = null;
    set({
      projectRoot: message.root,
      manifest: message.manifest,
      pages,
      activePageId,
      selection: null,
      layers: [],
      components: message.components ?? [],
    });
    if (activePageId) void refreshLayers(activePageId);
    void refreshTokens();
    if (bridge?.loadComments) {
      void bridge
        .loadComments()
        .then((doc) => {
          const threads = doc?.threads ?? [];
          set({ comments: threads });
          pushComments(threads);
        })
        .catch(() => {});
    }
  }

  if (bridge) {
    bridge.onProject(applyProject);
    bridge.onFiles((message) => {
      files = message.files;
      if (message.manifest) {
        const manifest = message.manifest;
        const pages = manifest.pages.map((page) => ({
          id: page.id,
          name: page.name,
          file: page.file,
        }));
        const activePageId =
          view.activePageId && pages.some((p) => p.id === view.activePageId)
            ? view.activePageId
            : (pages[0]?.id ?? null);
        set({
          manifest,
          pages,
          activePageId,
          components: message.components ?? view.components,
        });
      }
      if (view.activePageId) void refreshLayers(view.activePageId);
      if (selected) void selectNode(selected.ref.file, selected.path);
    });
    bridge.onDoc((message) => {
      if (message.kind === "diagnostics" && message.items)
        set({ diagnostics: message.items });
      if (message.kind === "historyChanged")
        set({
          canUndo: Boolean(message.canUndo),
          canRedo: Boolean(message.canRedo),
        });
      if (message.kind === "manifestChanged" && message.manifest) {
        const manifest = message.manifest;
        const pages = manifest.pages.map((page) => ({
          id: page.id,
          name: page.name,
          file: page.file,
        }));
        const activePageId =
          view.activePageId && pages.some((p) => p.id === view.activePageId)
            ? view.activePageId
            : (pages[0]?.id ?? null);
        set({ manifest, pages, activePageId });
      }
      if (message.kind === "commandFailed" && message.message)
        set({ notice: message.message, busy: false });
      if (message.kind === "transactionApplied") set({ busy: false });
    });
    bridge.onFatal((message) => set({ notice: `文档服务错误：${message}` }));
    bridge.onStats((stats) => set({ stats }));
    bridge.onSelectionChanged?.((payload) => {
      if (!payload) {
        selected = null;
        multiSelectionPaths = [];
        set({ selection: null });
        return;
      }
      const sel = payload as {
        file?: string;
        path?: number[];
        nodes?: Array<{ file: string; path: number[] }>;
      };
      multiSelectionPaths =
        sel.nodes && sel.nodes.length > 1
          ? sel.nodes.map((node) => ({ file: node.file, path: node.path }))
          : sel.file && sel.path
            ? [{ file: sel.file, path: sel.path }]
            : [];
      if (sel.file && sel.path) {
        void selectNode(sel.file, sel.path);
      }
    });
    bridge.onZoomChanged?.((zoom) => {
      set({ zoom });
    });
    bridge.onToolChanged?.((tool) => {
      if (view.activeTool !== tool) set({ activeTool: tool });
    });
    bridge.onCanvasEdit?.((payload) => {
      const edit = payload as { commands?: unknown[] };
      if (Array.isArray(edit?.commands)) {
        void sendCommands(edit.commands);
      }
    });
    bridge.onCommentPlaced?.((payload: unknown) => {
      const anchor = payload as CommentAnchor;
      if (anchor) {
        void actions.createCommentThread?.({
          anchor,
          author: "User",
          body: "新评论",
        });
        set({ activeTool: "select" });
      }
    });
    bridge.onCommentSelected?.((payload: unknown) => {
      const data = payload as { threadId?: string } | null;
      if (data?.threadId) {
        actions.selectCommentThread?.(data.threadId);
        set({ commentsTabRequest: (view.commentsTabRequest ?? 0) + 1 });
      }
    });
    bridge.onClipboardEdit?.((payload) => {
      const clip = payload as {
        kind?: "copy" | "cut" | "paste";
        dx?: number;
        dy?: number;
        nodes?: Array<{ file: string; path: number[] }>;
      };
      if (!clip?.kind || !Array.isArray(clip.nodes)) return;
      const resolveNodes = async () => {
        const resolved: ResolvedNode[] = [];
        for (const entry of clip.nodes ?? []) {
          const node = await bridge.resolveNode(entry.file, entry.path);
          if (node) resolved.push(node);
        }
        return resolved;
      };
      if (clip.kind === "paste") {
        void (async () => {
          const resolved =
            clipboard.length > 0 ? clipboard : await resolveNodes();
          const dx = clip.dx ?? 20;
          const dy = clip.dy ?? 20;
          const commands: unknown[] = [];
          for (const node of resolved) {
            commands.push({
              kind: "duplicateNode",
              target: toRef(node),
              dx,
              dy,
            });
          }
          if (commands.length > 0) void sendCommands(commands);
        })();
        return;
      }
      if (clip.kind === "copy") {
        void resolveNodes().then((nodes) => {
          clipboard = nodes;
        });
        return;
      }
      if (clip.kind === "cut") {
        void (async () => {
          clipboard = await resolveNodes();
          if (clipboard.length === 0) return;
          await sendCommands([
            { kind: "deleteNodes", targets: clipboard.map(toRef) },
          ]);
        })();
      }
    });
    bridge.onPrototypeModeChanged?.((active) => {
      set({ prototypeMode: Boolean(active) });
    });
    bridge.onPageChanged?.((pageId) => {
      if (pageId && view.activePageId !== pageId) {
        set({ activePageId: pageId });
        void refreshLayers(pageId);
      }
    });
  }
  return {
    getView: () => view,
    actions,
    files: () => files,
    subscribe(listener: (next: ShellView) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    openPath(path: string) {
      void bridge?.openPath(path);
    },
    openExample() {
      void bridge?.openExample();
    },
  };
}
