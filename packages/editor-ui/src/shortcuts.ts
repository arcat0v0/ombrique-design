import type { CanvasTool } from "./types";

export type ZoomAction = "in" | "out" | "fit" | "selection" | "actual";

export type ZOrderAction = "forward" | "backward" | "front" | "back";

export type ShortcutCommand =
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "delete" }
  | { kind: "duplicate" }
  | { kind: "copy" }
  | { kind: "cut" }
  | { kind: "paste"; inPlace: boolean }
  | { kind: "selectAll" }
  | { kind: "group" }
  | { kind: "ungroup" }
  | { kind: "toggleHidden" }
  | { kind: "toggleLocked" }
  | { kind: "zOrder"; action: ZOrderAction }
  | { kind: "nudge"; dx: number; dy: number }
  | { kind: "zoom"; action: ZoomAction }
  | { kind: "toggleRulers" }
  | { kind: "tool"; tool: CanvasTool }
  | { kind: "escape" }
  | { kind: "selectChild" }
  | { kind: "selectParent" }
  | { kind: "cycleLayer"; direction: 1 | -1 }
  | { kind: "opacity"; percent: number }
  | { kind: "rename" }
  | { kind: "flatten" }
  | { kind: "placeImage" }
  | { kind: "createComponent" }
  | { kind: "detachInstance" }
  | { kind: "exportSelection" };

export interface ShortcutKeyEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface ShortcutContext {
  hasSelection?: boolean;
}

interface ShortcutBinding {
  command: ShortcutCommand;
  key?: string;
  code?: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  needsSelection?: boolean;
}

const TOOL_KEYS: Array<[string, CanvasTool]> = [
  ["v", "select"],
  ["h", "hand"],
  ["f", "frame"],
  ["r", "rect"],
  ["o", "ellipse"],
  ["s", "star"],
  ["p", "pen"],
  ["t", "text"],
  ["c", "comment"],
];

const NUDGES: Array<[string, number, number]> = [
  ["arrowleft", -1, 0],
  ["arrowright", 1, 0],
  ["arrowup", 0, -1],
  ["arrowdown", 0, 1],
];

function opacityBindings(): ShortcutBinding[] {
  const bindings: ShortcutBinding[] = [];
  for (let digit = 0; digit <= 9; digit += 1) {
    bindings.push({
      code: `Digit${digit}`,
      key: String(digit),
      needsSelection: true,
      command: { kind: "opacity", percent: digit === 0 ? 100 : digit * 10 },
    });
  }
  return bindings;
}

function nudgeBindings(): ShortcutBinding[] {
  const bindings: ShortcutBinding[] = [];
  for (const [key, dx, dy] of NUDGES) {
    bindings.push({ key, command: { kind: "nudge", dx, dy } });
    bindings.push({
      key,
      shift: true,
      command: { kind: "nudge", dx: dx * 10, dy: dy * 10 },
    });
  }
  return bindings;
}

export const SHORTCUT_BINDINGS: ShortcutBinding[] = [
  ...TOOL_KEYS.map<ShortcutBinding>(([key, tool]) => ({
    key,
    command: { kind: "tool", tool },
  })),
  { key: "escape", command: { kind: "escape" } },
  { key: "enter", command: { kind: "selectChild" } },
  { key: "enter", shift: true, command: { kind: "selectParent" } },
  { key: "tab", command: { kind: "cycleLayer", direction: 1 } },
  { key: "tab", shift: true, command: { kind: "cycleLayer", direction: -1 } },
  ...nudgeBindings(),
  { code: "Digit1", key: "1", shift: true, command: { kind: "zoom", action: "fit" } },
  {
    code: "Digit2",
    key: "2",
    shift: true,
    command: { kind: "zoom", action: "selection" },
  },
  {
    code: "Digit0",
    key: "0",
    shift: true,
    command: { kind: "zoom", action: "actual" },
  },
  { code: "Digit0", key: "0", mod: true, command: { kind: "zoom", action: "actual" } },
  { code: "Equal", key: "=", mod: true, command: { kind: "zoom", action: "in" } },
  { code: "Equal", key: "+", mod: true, command: { kind: "zoom", action: "in" } },
  { code: "Minus", key: "-", mod: true, command: { kind: "zoom", action: "out" } },
  { code: "Equal", key: "=", command: { kind: "zoom", action: "in" } },
  { code: "Equal", key: "+", shift: true, command: { kind: "zoom", action: "in" } },
  { code: "Minus", key: "-", command: { kind: "zoom", action: "out" } },
  { key: "r", shift: true, command: { kind: "toggleRulers" } },
  { key: "z", mod: true, command: { kind: "undo" } },
  { key: "z", mod: true, shift: true, command: { kind: "redo" } },
  { key: "y", mod: true, command: { kind: "redo" } },
  { key: "delete", command: { kind: "delete" } },
  { key: "backspace", command: { kind: "delete" } },
  { key: "d", mod: true, command: { kind: "duplicate" } },
  { key: "c", mod: true, command: { kind: "copy" } },
  { key: "x", mod: true, command: { kind: "cut" } },
  { key: "v", mod: true, command: { kind: "paste", inPlace: false } },
  {
    key: "v",
    mod: true,
    shift: true,
    command: { kind: "paste", inPlace: true },
  },
  { key: "g", mod: true, command: { kind: "group" } },
  { key: "g", mod: true, shift: true, command: { kind: "ungroup" } },
  { key: "h", mod: true, shift: true, command: { kind: "toggleHidden" } },
  { key: "l", mod: true, shift: true, command: { kind: "toggleLocked" } },
  {
    code: "BracketRight",
    key: "]",
    mod: true,
    command: { kind: "zOrder", action: "forward" },
  },
  {
    code: "BracketRight",
    key: "]",
    mod: true,
    shift: true,
    command: { kind: "zOrder", action: "front" },
  },
  {
    code: "BracketLeft",
    key: "[",
    mod: true,
    command: { kind: "zOrder", action: "backward" },
  },
  {
    code: "BracketLeft",
    key: "[",
    mod: true,
    shift: true,
    command: { kind: "zOrder", action: "back" },
  },
  { key: "a", mod: true, command: { kind: "selectAll" } },
  { key: "r", mod: true, command: { kind: "rename" } },
  { key: "e", mod: true, command: { kind: "flatten" } },
  { key: "k", mod: true, shift: true, command: { kind: "placeImage" } },
  { key: "k", mod: true, alt: true, command: { kind: "createComponent" } },
  { key: "b", mod: true, alt: true, command: { kind: "detachInstance" } },
  { key: "e", mod: true, shift: true, command: { kind: "exportSelection" } },
  ...opacityBindings(),
];

const CANVAS_COMMAND_KINDS = new Set<ShortcutCommand["kind"]>([
  "tool",
  "escape",
  "selectAll",
  "nudge",
  "zoom",
  "toggleRulers",
  "selectChild",
  "selectParent",
  "cycleLayer",
]);

export function isCanvasShortcut(command: ShortcutCommand): boolean {
  return CANVAS_COMMAND_KINDS.has(command.kind);
}

export function resolveShortcut(
  event: ShortcutKeyEvent,
  context: ShortcutContext = {},
): ShortcutCommand | null {
  const key = event.key.toLowerCase();
  const mod = Boolean(event.metaKey || event.ctrlKey);
  const shift = Boolean(event.shiftKey);
  const alt = Boolean(event.altKey);
  for (const binding of SHORTCUT_BINDINGS) {
    if (binding.needsSelection && !context.hasSelection) continue;
    if (Boolean(binding.mod) !== mod) continue;
    if (Boolean(binding.shift) !== shift) continue;
    if (Boolean(binding.alt) !== alt) continue;
    const keyMatches = binding.key !== undefined && key === binding.key;
    const codeMatches =
      binding.code !== undefined && event.code === binding.code;
    if (!keyMatches && !codeMatches) continue;
    return binding.command;
  }
  return null;
}

export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || Boolean(target.isContentEditable);
}
