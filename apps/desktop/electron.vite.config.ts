import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import pkg from "./package.json" with { type: "json" };

const workspacePackages = Object.keys(pkg.dependencies).filter((d) =>
  d.startsWith("@ombrique/"),
);

const heavyExternals = [
  "vite",
  "@vitejs/plugin-react",
  "oxc-parser",
  "@oxc-parser/*",
];

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: workspacePackages,
        include: heavyExternals,
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          "doc-host": resolve(__dirname, "src/main/doc-host.ts"),
        },
        output: { format: "cjs", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: {
          shell: resolve(__dirname, "src/preload/shell.ts"),
          canvas: resolve(__dirname, "src/preload/canvas.ts"),
        },
        output: { format: "cjs", entryFileNames: "[name].js" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/shell"),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/shell/index.html"),
          "canvas-runtime": resolve(__dirname, "src/canvas/runtime.ts"),
        },
        output: { entryFileNames: "[name].js" },
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
