import { describe, expect, it } from "vitest";
import { resolveInside } from "./paths";

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
