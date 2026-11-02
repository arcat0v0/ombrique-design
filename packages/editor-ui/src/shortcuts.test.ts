import { describe, expect, it } from "vitest";
import {
  isCanvasShortcut,
  isTypingTarget,
  resolveShortcut,
  type ShortcutCommand,
} from "./shortcuts";

function key(
  value: string,
  options: {
    code?: string;
    mod?: boolean;
    shift?: boolean;
    alt?: boolean;
  } = {},
) {
  return {
    key: value,
    code: options.code,
    ctrlKey: options.mod,
    shiftKey: options.shift,
    altKey: options.alt,
  };
}

function resolve(
  value: string,
  options: {
    code?: string;
    mod?: boolean;
    shift?: boolean;
    alt?: boolean;
    hasSelection?: boolean;
  } = {},
): ShortcutCommand | null {
  return resolveShortcut(key(value, options), {
    hasSelection: options.hasSelection,
  });
}

describe("resolveShortcut", () => {
  it("maps tool keys to canvas tools", () => {
    expect(resolve("v")).toEqual({ kind: "tool", tool: "select" });
    expect(resolve("h")).toEqual({ kind: "tool", tool: "hand" });
    expect(resolve("f")).toEqual({ kind: "tool", tool: "frame" });
    expect(resolve("r")).toEqual({ kind: "tool", tool: "rect" });
    expect(resolve("o")).toEqual({ kind: "tool", tool: "ellipse" });
    expect(resolve("s")).toEqual({ kind: "tool", tool: "star" });
    expect(resolve("p")).toEqual({ kind: "tool", tool: "pen" });
    expect(resolve("t")).toEqual({ kind: "tool", tool: "text" });
    expect(resolve("c")).toEqual({ kind: "tool", tool: "comment" });
  });

  it("maps delete keys from both figma platforms", () => {
    expect(resolve("Delete")).toEqual({ kind: "delete" });
    expect(resolve("Backspace")).toEqual({ kind: "delete" });
  });

  it("maps history, clipboard, and grouping shortcuts", () => {
    expect(resolve("z", { mod: true })).toEqual({ kind: "undo" });
    expect(resolve("z", { mod: true, shift: true })).toEqual({ kind: "redo" });
    expect(resolve("y", { mod: true })).toEqual({ kind: "redo" });
    expect(resolve("d", { mod: true })).toEqual({ kind: "duplicate" });
    expect(resolve("c", { mod: true })).toEqual({ kind: "copy" });
    expect(resolve("x", { mod: true })).toEqual({ kind: "cut" });
    expect(resolve("v", { mod: true })).toEqual({
      kind: "paste",
      inPlace: false,
    });
    expect(resolve("v", { mod: true, shift: true })).toEqual({
      kind: "paste",
      inPlace: true,
    });
    expect(resolve("g", { mod: true })).toEqual({ kind: "group" });
    expect(resolve("g", { mod: true, shift: true })).toEqual({
      kind: "ungroup",
    });
    expect(resolve("a", { mod: true })).toEqual({ kind: "selectAll" });
  });

  it("maps visibility, lock, and z-order shortcuts", () => {
    expect(resolve("h", { mod: true, shift: true })).toEqual({
      kind: "toggleHidden",
    });
    expect(resolve("l", { mod: true, shift: true })).toEqual({
      kind: "toggleLocked",
    });
    expect(resolve("]", { mod: true, code: "BracketRight" })).toEqual({
      kind: "zOrder",
      action: "forward",
    });
    expect(
      resolve("}", { mod: true, shift: true, code: "BracketRight" }),
    ).toEqual({ kind: "zOrder", action: "front" });
    expect(resolve("[", { mod: true, code: "BracketLeft" })).toEqual({
      kind: "zOrder",
      action: "backward",
    });
    expect(
      resolve("{", { mod: true, shift: true, code: "BracketLeft" }),
    ).toEqual({ kind: "zOrder", action: "back" });
  });

  it("maps nudges and zoom controls", () => {
    expect(resolve("ArrowLeft")).toEqual({ kind: "nudge", dx: -1, dy: 0 });
    expect(resolve("ArrowUp", { shift: true })).toEqual({
      kind: "nudge",
      dx: 0,
      dy: -10,
    });
    expect(resolve("ArrowDown")).toEqual({ kind: "nudge", dx: 0, dy: 1 });
    expect(resolve("!", { shift: true, code: "Digit1" })).toEqual({
      kind: "zoom",
      action: "fit",
    });
    expect(resolve("2", { shift: true, code: "Digit2" })).toEqual({
      kind: "zoom",
      action: "selection",
    });
    expect(resolve("0", { shift: true, code: "Digit0" })).toEqual({
      kind: "zoom",
      action: "actual",
    });
    expect(resolve("0", { mod: true, code: "Digit0" })).toEqual({
      kind: "zoom",
      action: "actual",
    });
    expect(resolve("=", { mod: true, code: "Equal" })).toEqual({
      kind: "zoom",
      action: "in",
    });
    expect(resolve("+", { code: "Equal" })).toEqual({
      kind: "zoom",
      action: "in",
    });
    expect(resolve("-", { mod: true, code: "Minus" })).toEqual({
      kind: "zoom",
      action: "out",
    });
    expect(resolve("r", { shift: true })).toEqual({ kind: "toggleRulers" });
  });

  it("maps layer navigation and editing shortcuts", () => {
    expect(resolve("Enter")).toEqual({ kind: "selectChild" });
    expect(resolve("Enter", { shift: true })).toEqual({ kind: "selectParent" });
    expect(resolve("Tab")).toEqual({ kind: "cycleLayer", direction: 1 });
    expect(resolve("Tab", { shift: true })).toEqual({
      kind: "cycleLayer",
      direction: -1,
    });
    expect(resolve("Escape")).toEqual({ kind: "escape" });
    expect(resolve("r", { mod: true })).toEqual({ kind: "rename" });
    expect(resolve("e", { mod: true })).toEqual({ kind: "flatten" });
    expect(resolve("k", { mod: true, shift: true })).toEqual({
      kind: "placeImage",
    });
    expect(resolve("k", { mod: true, alt: true })).toEqual({
      kind: "createComponent",
    });
    expect(resolve("b", { mod: true, alt: true })).toEqual({
      kind: "detachInstance",
    });
    expect(resolve("e", { mod: true, shift: true })).toEqual({
      kind: "exportSelection",
    });
  });

  it("maps digit keys to opacity only with a selection", () => {
    expect(resolve("5", { code: "Digit5", hasSelection: true })).toEqual({
      kind: "opacity",
      percent: 50,
    });
    expect(resolve("0", { code: "Digit0", hasSelection: true })).toEqual({
      kind: "opacity",
      percent: 100,
    });
    expect(resolve("5", { code: "Digit5" })).toBeNull();
  });

  it("ignores unknown keys and modifier combinations", () => {
    expect(resolve("q")).toBeNull();
    expect(resolve("v", { shift: true })).toBeNull();
    expect(resolve("Delete", { mod: true })).toBeNull();
    expect(resolve("z", { mod: true, alt: true })).toBeNull();
  });

  it("separates canvas scoped commands from document commands", () => {
    expect(isCanvasShortcut({ kind: "nudge", dx: 1, dy: 0 })).toBe(true);
    expect(isCanvasShortcut({ kind: "tool", tool: "rect" })).toBe(true);
    expect(isCanvasShortcut({ kind: "delete" })).toBe(false);
    expect(isCanvasShortcut({ kind: "rename" })).toBe(false);
  });
});

describe("isTypingTarget", () => {
  it("detects form fields and contenteditable hosts", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true,
    );
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
