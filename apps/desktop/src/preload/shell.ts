import type { CanvasTool } from "@ombrique/editor-ui";
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ombriqueShell", {
  openProject: () => ipcRenderer.invoke("ombrique:openProject"),
  openPath: (path: string) => ipcRenderer.invoke("ombrique:openPath", path),
  send: (message: unknown) =>
    ipcRenderer.invoke("ombrique:shellMessage", message),
  readFiles: () => ipcRenderer.invoke("ombrique:readFiles"),
  reloadCanvas: () => ipcRenderer.invoke("ombrique:reloadCanvas"),
  onProject: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:project", (_event, payload) => cb(payload));
  },
  onFiles: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:files", (_event, payload) => cb(payload));
  },
  onDoc: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:doc", (_event, payload) => cb(payload));
  },
  onFatal: (cb: (message: string) => void) => {
    ipcRenderer.on("ombrique:fatal", (_event, message) => cb(String(message)));
  },
  resolveNode: (file: string, path: number[]) =>
    ipcRenderer.invoke("ombrique:resolveNode", file, path),
  tree: (file: string) => ipcRenderer.invoke("ombrique:tree", file),
  versions: () => ipcRenderer.invoke("ombrique:versions"),
  listTokens: () => ipcRenderer.invoke("ombrique:listTokens"),
  listTokenModes: () => ipcRenderer.invoke("ombrique:listTokenModes"),
  listStyles: () => ipcRenderer.invoke("ombrique:listStyles"),
  updateSharedStyle: (
    file: string,
    start: number,
    end: number,
    value: string,
  ) =>
    ipcRenderer.invoke("ombrique:shellMessage", {
      kind: "applyCommands",
      commands: [{ kind: "setSharedStyle", file, start, end, value }],
      baseVersions: [],
    }),
  setToken: (name: string, value: string, mode?: string) =>
    ipcRenderer.invoke("ombrique:shellMessage", {
      kind: "applyCommands",
      commands: [
        {
          kind: "setTokenValue",
          name,
          value,
          ...(mode === undefined ? {} : { mode }),
        },
      ],
      baseVersions: [],
    }),
  createToken: (name: string, value: string) =>
    ipcRenderer.invoke("ombrique:shellMessage", {
      kind: "applyCommands",
      commands: [{ kind: "createToken", name, value }],
      baseVersions: [],
    }),
  importImage: () => ipcRenderer.invoke("ombrique:importImage"),
  openExample: () => ipcRenderer.invoke("ombrique:openExample"),
  zoomTo: (factor: number) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:zoom",
      payload: factor,
    }),
  selectPage: (pageId: string) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:page",
      payload: pageId,
    }),
  selectLayer: (file: string, path: number[]) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:selectNode",
      payload: { file, path },
    }),
  zoomToFit: () =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:zoomToFit",
      payload: null,
    }),
  onSelectionChanged: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:selectionChanged", (_event, payload) =>
      cb(payload),
    );
  },
  onZoomChanged: (cb: (zoom: number) => void) => {
    ipcRenderer.on("ombrique:zoomChanged", (_event, zoom) => cb(Number(zoom)));
  },
  onCanvasEdit: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:canvasEdit", (_event, payload) => cb(payload));
  },
  sendResolvedProps: (
    file: string,
    path: number[],
    info: { attrs: string[]; locked: boolean; generated: boolean },
  ) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:resolvedProps",
      payload: { file, path, ...info },
    }),
  sendToolChanged: (tool: CanvasTool) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:toolChanged",
      payload: tool,
    }),
  onToolChanged: (cb: (tool: CanvasTool) => void) => {
    ipcRenderer.on("ombrique:fromShellTool", (_event, tool: CanvasTool) =>
      cb(tool),
    );
  },
  onClipboardEdit: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:clipboardEdit", (_event, payload) => cb(payload));
  },
  minimizeWindow: () => {
    ipcRenderer.send("ombrique:windowControl", "minimize");
  },
  toggleWindowMaximize: () => {
    ipcRenderer.send("ombrique:windowControl", "toggleMaximize");
  },
  closeWindow: () => {
    ipcRenderer.send("ombrique:windowControl", "close");
  },
  toggleFullscreen: () => {
    ipcRenderer.send("ombrique:windowControl", "toggleFullscreen");
  },
  toggleDevtools: () => {
    ipcRenderer.send("ombrique:windowControl", "toggleDevtools");
  },
  reloadRenderer: () => {
    ipcRenderer.send("ombrique:windowControl", "reloadRenderer");
  },
  exportPage: (file: string, defaultName: string) =>
    ipcRenderer.invoke("ombrique:exportPage", { file, defaultName }),
  exportNode: (payload: unknown) =>
    ipcRenderer.invoke("ombrique:exportNode", payload),
  bundleProject: () => ipcRenderer.invoke("ombrique:bundleProject"),
  openBundle: () => ipcRenderer.invoke("ombrique:openBundle"),
  updateCanvasBounds: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    ipcRenderer.send("ombrique:canvasBounds", bounds);
  },
  onStats: (cb: (stats: unknown) => void) => {
    ipcRenderer.on("ombrique:stats", (_event, stats) => cb(stats));
  },
  sendPrototypeMode: (active: boolean) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:prototypeMode",
      payload: active,
    }),
  sendShowHotspots: (show: boolean) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:showHotspots",
      payload: show,
    }),
  onPrototypeModeChanged: (cb: (active: boolean) => void) => {
    ipcRenderer.on("ombrique:prototypeModeChanged", (_event, payload) =>
      cb(Boolean(payload)),
    );
  },
  onPageChanged: (cb: (pageId: string) => void) => {
    ipcRenderer.on("ombrique:pageChanged", (_event, payload) =>
      cb(String(payload)),
    );
  },
  gitStatus: () => ipcRenderer.invoke("ombrique:gitStatus"),
  gitHistory: () => ipcRenderer.invoke("ombrique:gitHistory"),
  gitBranches: () => ipcRenderer.invoke("ombrique:gitBranches"),
  gitCreateBranch: (branch: string) =>
    ipcRenderer.invoke("ombrique:gitCreateBranch", branch),
  gitSwitchBranch: (branch: string) =>
    ipcRenderer.invoke("ombrique:gitSwitchBranch", branch),
  gitSaveVersion: (message: string) =>
    ipcRenderer.invoke("ombrique:gitSaveVersion", message),
  gitPreviewVersion: (rev: string) =>
    ipcRenderer.invoke("ombrique:gitPreviewVersion", rev),
  gitExitPreview: () => ipcRenderer.invoke("ombrique:gitExitPreview"),
  gitRestoreVersion: (rev: string) =>
    ipcRenderer.invoke("ombrique:gitRestoreVersion", rev),
  loadComments: () => ipcRenderer.invoke("ombrique:loadComments"),
  saveComments: (doc: unknown) =>
    ipcRenderer.invoke("ombrique:saveComments", doc),
  onCommentPlaced: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:commentPlaced", (_event, payload) => cb(payload));
  },
  pushComments: (threads: unknown) =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:comments",
      payload: threads,
    }),
  onCommentSelected: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:commentSelected", (_event, payload) =>
      cb(payload),
    );
  },
});
