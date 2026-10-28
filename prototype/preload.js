const { contextBridge, ipcRenderer } = require("electron");

let paintCount = 0;
let lastChanged = -1;

contextBridge.exposeInMainWorld("protoBridge", {
  reportProbe: (data) => ipcRenderer.send("proto-probe", data),
  askIsolated: () => ipcRenderer.send("proto-isolated", { reason: "poll", paintCount, lastChanged }),
  shot: (name) => ipcRenderer.invoke("proto-shot", name),
  results: (data) => ipcRenderer.send("proto-results", data),
});

window.addEventListener("DOMContentLoaded", async () => {
  const info = { reason: "boot", hasGpu: typeof navigator.gpu !== "undefined" };
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      info.adapter = adapter && adapter.info ? `${adapter.info.vendor} ${adapter.info.architecture}` : null;
    } catch (err) {
      info.adapter = `error: ${err.message}`;
    }
  }
  const cv = document.querySelector("canvas");
  if (cv) {
    cv.addEventListener("paint", (e) => {
      paintCount += 1;
      lastChanged = e.changedElements.length;
    });
    info.paintListener = true;
  }
  ipcRenderer.send("proto-isolated", info);
});
