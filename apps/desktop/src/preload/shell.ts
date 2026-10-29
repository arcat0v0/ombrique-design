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
  setToken: (name: string, value: string) =>
    ipcRenderer.invoke("ombrique:shellMessage", {
      kind: "applyCommands",
      commands: [{ kind: "setTokenValue", name, value }],
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
  sendToolChanged: (tool: "select" | "hand") =>
    ipcRenderer.send("ombrique:toCanvas", {
      channel: "ombrique:toolChanged",
      payload: tool,
    }),
  onClipboardEdit: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:clipboardEdit", (_event, payload) => cb(payload));
  },
  exportPage: (file: string, defaultName: string) =>
    ipcRenderer.invoke("ombrique:exportPage", { file, defaultName }),
  exportNode: (payload: {
    file: string;
    path?: number[];
    format: "png" | "jpg" | "webp" | "svg" | "pdf";
    scale: number;
    defaultName: string;
  }) => ipcRenderer.invoke("ombrique:exportNode", payload),
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
});
