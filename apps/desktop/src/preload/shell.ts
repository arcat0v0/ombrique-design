import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ombriqueShell", {
  version: process.versions.electron,
});
