import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import pkg from "./package.json" with { type: "json" };

const workspacePackages = Object.keys(pkg.dependencies).filter((d) =>
  d.startsWith("@ombrique/"),
);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: { shell: resolve(__dirname, "src/preload/shell.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/shell"),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/shell/index.html") },
      },
    },
    plugins: [react()],
  },
});
