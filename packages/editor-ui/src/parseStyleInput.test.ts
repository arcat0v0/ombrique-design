import { describe, expect, it } from "vitest";
import { parseStyleInput } from "./parseStyleInput";

describe("parseStyleInput", () => {
  it("parses px-style numeric keys into numbers, with or without px suffix", () => {
    expect(parseStyleInput("width", "24")).toBe(24);
    expect(parseStyleInput("width", "24px")).toBe(24);
    expect(parseStyleInput("height", " 12 px ")).toBe(12);
    expect(parseStyleInput("border-radius", "12.5px")).toBe(12.5);
    expect(parseStyleInput("gap", "8px")).toBe(8);
    expect(parseStyleInput("padding", "16px")).toBe(16);
  });

  it("parses unitless numeric keys into numbers", () => {
    expect(parseStyleInput("opacity", "0.5")).toBe(0.5);
    expect(parseStyleInput("z-index", "10")).toBe(10);
    expect(parseStyleInput("font-weight", "600")).toBe(600);
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(parseStyleInput("width", "")).toBeNull();
    expect(parseStyleInput("color", "   ")).toBeNull();
  });

  it("keeps color strings unchanged", () => {
    expect(parseStyleInput("color", "#ff0000")).toBe("#ff0000");
    expect(parseStyleInput("background", "rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(parseStyleInput("color", "red")).toBe("red");
  });

  it("keeps non-numeric values for numeric keys as strings", () => {
    expect(parseStyleInput("width", "auto")).toBe("auto");
    expect(parseStyleInput("width", "100%")).toBe("100%");
  });

  it("matches keys case-insensitively", () => {
    expect(parseStyleInput("Width", "24")).toBe(24);
    expect(parseStyleInput("OPACITY", "0.25")).toBe(0.25);
  });
  it("supports camelCase style keys like fontSize, rowGap, borderRadius", () => {
    expect(parseStyleInput("fontSize", "16")).toBe(16);
    expect(parseStyleInput("rowGap", "8")).toBe(8);
    expect(parseStyleInput("paddingTop", "24")).toBe(24);
    expect(parseStyleInput("borderRadius", "10")).toBe(10);
  });

  it("returns non-numeric-key input trimmed as a string", () => {
    expect(parseStyleInput("display", " flex ")).toBe("flex");
    expect(parseStyleInput("alignItems", "center")).toBe("center");
    expect(parseStyleInput("justifyContent", "space-between")).toBe(
      "space-between",
    );
    expect(parseStyleInput("flexWrap", "wrap")).toBe("wrap");
  });
});
