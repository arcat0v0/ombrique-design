import { describe, expect, it } from "vitest";
import { applyEdits } from "./apply-edits.js";
import type { TextEdit } from "./types.js";

describe("applyEdits", () => {
  it("applies a single replacement", () => {
    expect(
      applyEdits("hello world", [
        { file: "a", start: 0, end: 5, text: "goodbye" },
      ]),
    ).toBe("goodbye world");
  });

  it("applies inserts and deletes regardless of input order, preserving same-offset insert order", () => {
    const edits: TextEdit[] = [
      { file: "a", start: 5, end: 6, text: "" },
      { file: "a", start: 0, end: 0, text: ">>" },
    ];
    expect(applyEdits("hello world", edits)).toBe(">>helloworld");
    expect(
      applyEdits("abc", [
        { file: "a", start: 3, end: 3, text: "X" },
        { file: "a", start: 3, end: 3, text: "Y" },
      ]),
    ).toBe("abcXY");
  });

  it("throws on overlapping and out-of-bounds edits", () => {
    expect(() =>
      applyEdits("abcde", [
        { file: "a", start: 0, end: 3, text: "X" },
        { file: "a", start: 2, end: 5, text: "Y" },
      ]),
    ).toThrow(/overlapping/);
    expect(() =>
      applyEdits("abc", [{ file: "a", start: 0, end: 10, text: "X" }]),
    ).toThrow(/out of bounds/);
  });
});
