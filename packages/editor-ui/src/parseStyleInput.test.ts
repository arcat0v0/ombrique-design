import { describe, expect, it } from "vitest";
import { parseStyleInput } from "./parseStyleInput";

describe("parseStyleInput", () => {
  it("parses numeric values correctly across units, casings and keys", () => {
    const cases: Array<[string, string, number]> = [
      ["width", "24", 24],
      ["width", "24px", 24],
      ["height", " 12 px ", 12],
      ["border-radius", "12.5px", 12.5],
      ["gap", "8px", 8],
      ["padding", "16px", 16],
      ["opacity", "0.5", 0.5],
      ["z-index", "10", 10],
      ["font-weight", "600", 600],
      ["Width", "24", 24],
      ["OPACITY", "0.25", 0.25],
      ["fontSize", "16", 16],
      ["rowGap", "8", 8],
      ["paddingTop", "24", 24],
      ["borderRadius", "10", 10],
    ];
    for (const [key, input, expected] of cases) {
      expect(parseStyleInput(key, input)).toBe(expected);
    }
  });

  it("handles non-numeric, string, or empty values", () => {
    const cases: Array<[string, string, string | null]> = [
      ["width", "", null],
      ["color", "   ", null],
      ["color", "#ff0000", "#ff0000"],
      ["background", "rgb(1, 2, 3)", "rgb(1, 2, 3)"],
      ["width", "auto", "auto"],
      ["width", "100%", "100%"],
      ["display", " flex ", "flex"],
      ["alignItems", "center", "center"],
      ["justifyContent", "space-between", "space-between"],
      ["flexWrap", "wrap", "wrap"],
    ];
    for (const [key, input, expected] of cases) {
      expect(parseStyleInput(key, input)).toBe(expected);
    }
  });
});
