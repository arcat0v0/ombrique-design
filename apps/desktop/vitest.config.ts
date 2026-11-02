import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "../../packages/editor-ui/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
