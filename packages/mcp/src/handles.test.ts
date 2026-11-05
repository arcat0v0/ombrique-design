import { describe, expect, it } from "vitest";
import { HandleLimitError, HandleRegistry } from "./handles";

describe("HandleRegistry", () => {
  it("issues opaque handles and invalidates them by file", () => {
    const registry = new HandleRegistry();
    const first = registry.issue({
      file: "pages/home.tsx",
      path: [0, 0],
      tag: "h1",
      dataName: "Title",
      fragmentHash: "aaa",
    });
    const second = registry.issue({
      file: "pages/pricing.tsx",
      path: [0],
      tag: "frame",
      dataName: "Pricing",
      fragmentHash: "bbb",
    });
    expect(first).not.toBe(second);
    expect(registry.get(first)).toMatchObject({
      file: "pages/home.tsx",
      path: [0, 0],
      tag: "h1",
      dataName: "Title",
      fragmentHash: "aaa",
    });
    expect(registry.invalidateFile("pages/home.tsx")).toEqual([first]);
    expect(registry.get(first)).toBeNull();
    expect(registry.get(second)).not.toBeNull();
  });

  it("invalidates every handle", () => {
    const registry = new HandleRegistry();
    const first = registry.issue({
      file: "pages/home.tsx",
      path: [0],
      tag: "frame",
      dataName: "Home",
      fragmentHash: "aaa",
    });
    const second = registry.issue({
      file: "pages/pricing.tsx",
      path: [0],
      tag: "frame",
      dataName: "Pricing",
      fragmentHash: "bbb",
    });
    expect(registry.invalidateAll()).toEqual([first, second]);
    expect(registry.size).toBe(0);
  });

  it("replaces the handle scope with a page atomically", () => {
    const registry = new HandleRegistry(4);
    const first = registry.issue({
      file: "pages/home.tsx",
      path: [0],
      tag: "frame",
      dataName: "Home",
      fragmentHash: "aaa",
    });
    const next = registry.fork(2);
    const second = next.issue({
      file: "pages/pricing.tsx",
      path: [0],
      tag: "frame",
      dataName: "Pricing",
      fragmentHash: "bbb",
    });
    const third = next.issue({
      file: "pages/pricing.tsx",
      path: [0, 0],
      tag: "h1",
      dataName: "Title",
      fragmentHash: "ccc",
    });
    registry.adopt(next);
    expect(registry.get(first)).toBeNull();
    expect(registry.get(second)?.file).toBe("pages/pricing.tsx");
    expect(registry.get(third)?.file).toBe("pages/pricing.tsx");
    expect(registry.size).toBe(2);
  });

  it("leaves the live scope untouched when a temporary build fails", () => {
    const registry = new HandleRegistry(1);
    const first = registry.issue({
      file: "pages/home.tsx",
      path: [0],
      tag: "frame",
      dataName: "Home",
      fragmentHash: "aaa",
    });
    const next = registry.fork(1);
    next.issue({
      file: "pages/pricing.tsx",
      path: [0],
      tag: "frame",
      dataName: "Pricing",
      fragmentHash: "bbb",
    });
    expect(() =>
      next.issue({
        file: "pages/pricing.tsx",
        path: [0, 0],
        tag: "h1",
        dataName: "Title",
        fragmentHash: "ccc",
      }),
    ).toThrow(HandleLimitError);
    expect(registry.get(first)).not.toBeNull();
    expect(registry.size).toBe(1);
  });

  it("enforces the per-page handle limit", () => {
    const registry = new HandleRegistry(2);
    registry.issue({
      file: "pages/home.tsx",
      path: [0],
      tag: "frame",
      dataName: "Home",
      fragmentHash: "aaa",
    });
    registry.issue({
      file: "pages/home.tsx",
      path: [0, 0],
      tag: "h1",
      dataName: "Title",
      fragmentHash: "bbb",
    });
    const overflow = {
      file: "pages/home.tsx",
      path: [0, 1],
      tag: "h1",
      dataName: "Other",
      fragmentHash: "ccc",
    };
    expect(() => registry.issue(overflow)).toThrow(HandleLimitError);
    expect(() => registry.issue(overflow)).toThrow(
      "single-page handle limit reached (2); this read needs 3 handles. Re-reading the same page cannot help. Reduce the page size, split the page into smaller pages, or start a new session.",
    );
    expect(registry.size).toBe(2);
  });
});
