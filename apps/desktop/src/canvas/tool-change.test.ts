import { describe, expect, it } from "vitest";
import { resolveCanvasTool } from "./tool-change";

describe("resolveCanvasTool", () => {
  it("accepts the string payload emitted by FloatingToolSwitcher", () => {
    expect(resolveCanvasTool("comment")).toBe("comment");
    expect(resolveCanvasTool("select")).toBe("select");
  });

  it("still accepts the legacy object payload", () => {
    expect(resolveCanvasTool({ tool: "comment" })).toBe("comment");
  });

  it("ignores unknown tools", () => {
    expect(resolveCanvasTool("unknown")).toBeNull();
    expect(resolveCanvasTool(null)).toBeNull();
  });
});
