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

  it("applies inserts and deletes", () => {
    const edits: TextEdit[] = [
      { file: "a", start: 5, end: 6, text: "" },
      { file: "a", start: 0, end: 0, text: ">>" },
    ];
    expect(applyEdits("hello world", edits)).toBe(">>helloworld");
  });

  it("applies multiple edits regardless of input order", () => {
    const edits: TextEdit[] = [
      { file: "a", start: 0, end: 1, text: "A" },
      { file: "a", start: 4, end: 5, text: "E" },
    ];
    expect(applyEdits("abcde", edits)).toBe("Abcde".replace("e", "E"));
  });

  it("preserves order for multiple inserts at the same offset", () => {
    const edits: TextEdit[] = [
      { file: "a", start: 3, end: 3, text: "X" },
      { file: "a", start: 3, end: 3, text: "Y" },
    ];
    expect(applyEdits("abc", edits)).toBe("abcXY");
  });

  it("throws on overlapping edits", () => {
    const edits: TextEdit[] = [
      { file: "a", start: 0, end: 3, text: "X" },
      { file: "a", start: 2, end: 5, text: "Y" },
    ];
    expect(() => applyEdits("abcde", edits)).toThrow(/overlapping/);
  });

  it("throws on out-of-bounds edits", () => {
    expect(() =>
      applyEdits("abc", [{ file: "a", start: 0, end: 10, text: "X" }]),
    ).toThrow(/out of bounds/);
  });
});
