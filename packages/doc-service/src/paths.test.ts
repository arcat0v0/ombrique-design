import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listDesignFiles, resolveInside } from "./paths";

describe("resolveInside", () => {
  it("resolves nested relative paths", () => {
    expect(resolveInside("/proj", "pages/home.tsx")).toBe(
      "/proj/pages/home.tsx",
    );
    expect(resolveInside("/proj", "./pages/./home.tsx")).toBe(
      "/proj/pages/home.tsx",
    );
  });

  it("rejects escapes and absolute paths", () => {
    expect(() => resolveInside("/proj", "../secret")).toThrow();
    expect(() => resolveInside("/proj", "pages/../../secret")).toThrow();
    expect(() => resolveInside("/proj", "/etc/passwd")).toThrow();
    expect(() => resolveInside("/proj", ".")).toThrow();
  });
});

describe("listDesignFiles", () => {
  it("keeps the root icons directory out of the design snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "ombrique-icons-"));
    mkdirSync(join(root, "pages"), { recursive: true });
    mkdirSync(join(root, "icons"), { recursive: true });
    mkdirSync(join(root, "assets/icons"), { recursive: true });
    writeFileSync(join(root, "pages/home.tsx"), "", "utf8");
    writeFileSync(join(root, "icons/lucide.json"), "{}", "utf8");
    writeFileSync(join(root, "icons/logo.svg"), "<svg />", "utf8");
    writeFileSync(join(root, "assets/icons/keep.svg"), "<svg />", "utf8");
    try {
      expect(listDesignFiles(root)).toEqual([
        "assets/icons/keep.svg",
        "pages/home.tsx",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
