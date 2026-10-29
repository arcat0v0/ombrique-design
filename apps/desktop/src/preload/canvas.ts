import { contextBridge, ipcRenderer } from "electron";

interface HotPayload {
  type: string;
  [key: string]: unknown;
}

contextBridge.exposeInMainWorld("ombriqueCanvas", {
  onProject: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:project", (_event, payload) => cb(payload));
  },
  onHmr: (cb: (payload: HotPayload) => void) => {
    ipcRenderer.on("ombrique:hmr", (_event, payload) =>
      cb(payload as HotPayload),
    );
  },
  onSelection: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:selection", (_event, payload) => cb(payload));
  },
  onPage: (cb: (pageId: string) => void) => {
    ipcRenderer.on("ombrique:page", (_event, pageId) => cb(String(pageId)));
  },
  onManifest: (cb: (payload: unknown) => void) => {
    ipcRenderer.on("ombrique:manifest", (_event, payload) => cb(payload));
  },
  onViewCommand: (cb: (payload: unknown) => void) => {
    for (const channel of [
      "ombrique:zoom",
      "ombrique:zoomToFit",
      "ombrique:selectNode",
      "ombrique:toolChanged",
      "ombrique:resolvedProps",
      "ombrique:export",
      "ombrique:perf500",
    ]) {
      ipcRenderer.on(channel, (_event, payload) => cb({ channel, payload }));
    }
  },
  send: (channel: string, payload: unknown) => {
    ipcRenderer.send("ombrique:fromCanvas", { channel, payload });
  },
});
