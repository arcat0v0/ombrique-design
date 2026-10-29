import { createRoot, type Root } from "react-dom/client";
import { createElement, type ComponentType } from "react";
import { FloatingToolSwitcher } from "@ombrique/editor-ui";
import type { Manifest } from "@ombrique/protocol";
import {
  createCompositor,
  type BoardInit,
  type Compositor,
} from "@ombrique/canvas";

interface CanvasBridge {
  onProject: (cb: (payload: ProjectMessage) => void) => void;
  onHmr: (cb: (payload: HmrPayload) => void) => void;
  onViewCommand: (cb: (payload: unknown) => void) => void;
  onPage: (cb: (pageId: string) => void) => void;
  onManifest: (cb: (payload: unknown) => void) => void;
  send: (channel: string, payload: unknown) => void;
}

interface ProjectMessage {
  root: string;
  manifest: Manifest;
  files: Record<string, string>;
}

interface HmrPayload {
  type: string;
  updates?: Array<{ path: string; acceptedPath: string }>;
}

interface SelectedNode {
  file: string;
  path: number[];
  tag: string;
  name: string | null;
  rect: { x: number; y: number; width: number; height: number };
  element: Element;
}

type DragMode = "none" | "pan" | "move" | "scale";
type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: Array<{ id: HandleId; x: number; y: number; cursor: string }> = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

const HANDLE_SIZE = 10;

const bridge = (window as unknown as { ombriqueCanvas?: CanvasBridge })
  .ombriqueCanvas;

const canvasElement = document.getElementById("cv");
const overlayElement = document.getElementById("overlay");

if (!canvasElement || !overlayElement)
  throw new Error("canvas host markup missing");

const canvas: HTMLElement = canvasElement;
const overlay: HTMLElement = overlayElement;
let stage: HTMLElement = canvas;

const boards = new Map<string, { element: HTMLElement; reactRoot: Root }>();
const nodeIndex = new Map<Element, { file: string; path: number[] }>();
let manifest: Manifest | null = null;
let compositor: Compositor | null = null;
let selection: SelectedNode | null = null;
let multiSelection: SelectedNode[] = [];
let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
let currentFile: string | null = null;
let firstMount = true;
let spacePressed = false;
let toolMode: "select" | "hand" = "select";
let editingText: HTMLElement | null = null;
let editingOriginal = "";
const nodeProps = new Map<
  string,
  { attrs: string[]; locked: boolean; generated: boolean }
>();
const camera = { x: 0, y: 0, z: 1 };
const drag: {
  mode: DragMode;
  x: number;
  y: number;
  moved: boolean;
  handle: HandleId | null;
  originRect: { x: number; y: number; width: number; height: number } | null;
} = { mode: "none", x: 0, y: 0, moved: false, handle: null, originRect: null };

function emitSelection() {
  if (editingText) return;
  const { element: _element, ...rest } = selection ?? {};
  const nodes = multiSelection.map((node) => {
    const { element: _el, rect: _rect, ...nodeRest } = node;
    return nodeRest;
  });
  bridge?.send("ombrique:selectionChanged", {
    ...rest,
    nodes,
  });
}

function nodeKeyOf(file: string, path: number[]): string {
  return `${file}#/${path.join("/")}`;
}

function flagsOf(node: SelectedNode): {
  attrs: string[];
  locked: boolean;
  generated: boolean;
} {
  const flags = nodeProps.get(nodeKeyOf(node.file, node.path));
  if (flags) return flags;
  return {
    attrs: [],
    locked: node.element.hasAttribute("data-locked"),
    generated: false,
  };
}

function isEditableNode(node: SelectedNode): boolean {
  const flags = flagsOf(node);
  return !flags.locked && !flags.generated;
}

function selectSingle(node: SelectedNode | null): void {
  selection = node;
  multiSelection = node ? [node] : [];
  emitSelection();
  drawOverlay();
}

function toggleInSelection(node: SelectedNode): void {
  const existing = multiSelection.findIndex(
    (entry) => entry.element === node.element,
  );
  if (existing >= 0) {
    multiSelection.splice(existing, 1);
    selection = multiSelection.at(-1) ?? null;
  } else {
    multiSelection.push(node);
    selection = node;
  }
  emitSelection();
  drawOverlay();
}

function emitZoom() {
  bridge?.send("ombrique:zoomChanged", camera.z);
}

function computePath(element: Element, board: HTMLElement): number[] {
  const path: number[] = [];
  let current: Element | null = element;
  while (current && current !== board) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const drawables = Array.from(parent.children);
    path.unshift(drawables.indexOf(current));
    current = parent;
  }
  return path;
}

function registerSubtree(element: Element, board: HTMLElement, file: string) {
  nodeIndex.set(element, { file, path: computePath(element, board) });
  for (const child of Array.from(element.children))
    registerSubtree(child, board, file);
}

async function importPage(
  file: string,
  bust: number,
): Promise<ComponentType | null> {
  const specifier = `/${file}?t=${bust}`;
  const module = (await import(/* @vite-ignore */ specifier)) as {
    default?: ComponentType;
  };
  return module.default ?? null;
}

function refreshSelectionRect(): void {
  const nodes =
    multiSelection.length > 0 ? multiSelection : selection ? [selection] : [];
  for (const node of nodes) {
    const bounds = node.element.getBoundingClientRect();
    node.rect = {
      x: bounds.left / camera.z + camera.x,
      y: bounds.top / camera.z + camera.y,
      width: bounds.width / camera.z,
      height: bounds.height / camera.z,
    };
  }
}

function refreshRectsOf(nodes: SelectedNode[]): void {
  for (const node of nodes) {
    const bounds = node.element.getBoundingClientRect();
    node.rect = {
      x: bounds.left / camera.z + camera.x,
      y: bounds.top / camera.z + camera.y,
      width: bounds.width / camera.z,
      height: bounds.height / camera.z,
    };
  }
}

function fitToViewport(): void {
  const allBoards: BoardInit[] = [];
  let x = 0;
  for (const [, entry] of boards) {
    allBoards.push({
      el: entry.element,
      worldX: x,
      worldY: 0,
      worldW: entry.element.offsetWidth,
      worldH: entry.element.offsetHeight,
    });
    x += entry.element.offsetWidth + 60;
  }
  if (allBoards.length === 0) return;
  const bounds = stage.getBoundingClientRect();
  const minX = Math.min(...allBoards.map((b) => b.worldX));
  const minY = Math.min(...allBoards.map((b) => b.worldY));
  const maxX = Math.max(...allBoards.map((b) => b.worldX + b.worldW));
  const maxY = Math.max(...allBoards.map((b) => b.worldY + b.worldH));
  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;
  if (totalWidth <= 0 || totalHeight <= 0) return;
  const fit = Math.min(
    (bounds.width - 80) / totalWidth,
    (bounds.height - 80) / totalHeight,
  );
  camera.z = Math.max(0.05, Math.min(32, fit));
  camera.x = minX - (bounds.width - totalWidth * camera.z) / 2 / camera.z;
  camera.y = minY - (bounds.height - totalHeight * camera.z) / 2 / camera.z;
  compositor?.camera.set(camera);
  drawOverlay();
  emitZoom();
}

async function mountPage(file: string) {
  if (!manifest) return;
  currentFile = file;
  for (const [key, board] of boards) {
    if (key === file) continue;
    board.reactRoot.unmount();
    board.element.remove();
    boards.delete(key);
  }

  let board = boards.get(file);
  if (!board) {
    const element = document.createElement("section");
    element.className = "board";
    element.dataset.file = file;
    element.setAttribute("drawable", "");
    const root = createRoot(element);
    board = { element, reactRoot: root };
    boards.set(file, board);
    stage.appendChild(element);
    let component: ComponentType | null = null;
    try {
      component = await importPage(file, Date.now());
    } catch (error) {
      console.warn(`[canvas] page module unavailable: ${file}`, error);
    }
    if (component) {
      root.render(createElement(component));
      const { promise, resolve } = Promise.withResolvers<void>();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      await promise;
    }
  }
  registerSubtree(board.element, board.element, file);

  const allBoards: BoardInit[] = [];
  let x = 0;
  for (const [key, entry] of boards) {
    entry.element.style.left = "0px";
    entry.element.style.top = "0px";
    entry.element.style.transform = `translate(${x}px, 0px)`;
    allBoards.push({
      el: entry.element,
      worldX: x,
      worldY: 0,
      worldW: entry.element.offsetWidth,
      worldH: entry.element.offsetHeight,
    });
    x += entry.element.offsetWidth + 60;
    void key;
  }
  compositor?.setBoards(allBoards);
  const bounds = stage.getBoundingClientRect();
  if (allBoards.length > 0 && firstMount) {
    const totalWidth = allBoards.reduce(
      (sum, entry) => Math.max(sum, entry.worldX + entry.worldW),
      0,
    );
    const totalHeight = allBoards.reduce(
      (sum, entry) => Math.max(sum, entry.worldY + entry.worldH),
      0,
    );
    const fit = Math.min(
      (bounds.width - 80) / totalWidth,
      (bounds.height - 80) / totalHeight,
      1,
    );
    camera.x = -40 / fit;
    camera.y = -40 / fit;
    camera.z = fit;
    firstMount = false;
    emitZoom();
  }
  compositor?.camera.set(camera);
  refreshSelectionRect();
  drawOverlay();
}

function drawOverlay() {
  if (!overlay) return;
  overlay.replaceChildren();
  if (editingText) return;
  for (const node of multiSelection) {
    const rect = node.rect;
    const box = document.createElement("div");
    box.className = "selection-box";
    box.style.left = `${(rect.x - camera.x) * camera.z}px`;
    box.style.top = `${(rect.y - camera.y) * camera.z}px`;
    box.style.width = `${rect.width * camera.z}px`;
    box.style.height = `${rect.height * camera.z}px`;
    overlay.appendChild(box);
  }
  if (selection && multiSelection.length <= 1 && isEditableNode(selection)) {
    const rect = selection.rect;
    const handleSize = HANDLE_SIZE / camera.z > 4 ? HANDLE_SIZE : 4;
    for (const handle of HANDLES) {
      const dot = document.createElement("div");
      dot.className = "selection-handle";
      dot.dataset.handle = handle.id;
      dot.style.position = "absolute";
      dot.style.width = `${handleSize}px`;
      dot.style.height = `${handleSize}px`;
      dot.style.left = `${(rect.x - camera.x + rect.width * handle.x) * camera.z - handleSize / 2}px`;
      dot.style.top = `${(rect.y - camera.y + rect.height * handle.y) * camera.z - handleSize / 2}px`;
      dot.style.border = "1px solid #4c8dff";
      dot.style.borderRadius = "2px";
      dot.style.backgroundColor = "#ffffff";
      overlay.appendChild(dot);
    }
  }
  if (marquee) {
    const band = document.createElement("div");
    band.className = "marquee-band";
    band.style.position = "absolute";
    band.style.border = "1px dashed #4c8dff";
    band.style.backgroundColor = "rgba(76, 141, 255, 0.12)";
    band.style.left = `${(Math.min(marquee.x0, marquee.x1) - camera.x) * camera.z}px`;
    band.style.top = `${(Math.min(marquee.y0, marquee.y1) - camera.y) * camera.z}px`;
    band.style.width = `${Math.abs(marquee.x1 - marquee.x0) * camera.z}px`;
    band.style.height = `${Math.abs(marquee.y1 - marquee.y0) * camera.z}px`;
    overlay.appendChild(band);
  }
}

function isSelectableElement(element: Element, board: HTMLElement): boolean {
  let current: Element | null = element;
  while (current && current !== board) {
    if (current.hasAttribute("data-locked")) return false;
    if (
      current.hasAttribute("hidden") ||
      (current instanceof HTMLElement && current.style.display === "none")
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function hitTest(clientX: number, clientY: number): SelectedNode | null {
  for (const [element, info] of [...nodeIndex].reverse()) {
    const board = element.closest<HTMLElement>(".board");
    if (!board || !isSelectableElement(element, board)) continue;
    const bounds = element.getBoundingClientRect();
    if (
      bounds.width === 0 ||
      bounds.height === 0 ||
      !(
        clientX >= bounds.left &&
        clientX <= bounds.right &&
        clientY >= bounds.top &&
        clientY <= bounds.bottom
      )
    ) {
      continue;
    }
    return {
      file: info.file,
      path: info.path,
      tag: element.tagName.toLowerCase(),
      name: element.getAttribute("data-name"),
      rect: {
        x: bounds.left / camera.z + camera.x,
        y: bounds.top / camera.z + camera.y,
        width: bounds.width / camera.z,
        height: bounds.height / camera.z,
      },
      element,
    };
  }
  return null;
}

function handleAtPoint(clientX: number, clientY: number): HandleId | null {
  if (!selection || editingText) return null;
  const rect = selection.rect;
  const handleSize = HANDLE_SIZE / camera.z > 4 ? HANDLE_SIZE : 4;
  for (const handle of HANDLES) {
    const hx =
      (rect.x - camera.x + rect.width * handle.x) * camera.z - handleSize / 2;
    const hy =
      (rect.y - camera.y + rect.height * handle.y) * camera.z - handleSize / 2;
    if (
      clientX >= hx &&
      clientX <= hx + handleSize &&
      clientY >= hy &&
      clientY <= hy + handleSize
    ) {
      return handle.id;
    }
  }
  return null;
}

function selectionElementOf(file: string, path: number[]): SelectedNode | null {
  for (const [element, info] of nodeIndex) {
    if (info.file !== file) continue;
    if (info.path.join("/") !== path.join("/")) continue;
    const bounds = element.getBoundingClientRect();
    return {
      file: info.file,
      path: info.path,
      tag: element.tagName.toLowerCase(),
      name: element.getAttribute("data-name"),
      rect: {
        x: bounds.left / camera.z + camera.x,
        y: bounds.top / camera.z + camera.y,
        width: bounds.width / camera.z,
        height: bounds.height / camera.z,
      },
      element,
    };
  }
  return null;
}

function commitMove(node: SelectedNode, dx: number, dy: number): void {
  if (!isEditableNode(node)) return;
  const flags = flagsOf(node);
  const usesAttrsX = flags.attrs.includes("x") && flags.attrs.includes("y");
  const target = { file: node.file, start: 0, end: 0, path: node.path };
  const commands: unknown[] = [];
  if (usesAttrsX) {
    commands.push({
      kind: "setAttrs",
      target,
      attrs: {
        x: Math.round(node.rect.x + dx),
        y: Math.round(node.rect.y + dy),
      },
    });
  } else {
    commands.push({
      kind: "setStyle",
      target,
      declarations: [
        ["left", Math.round(node.rect.x + dx)],
        ["top", Math.round(node.rect.y + dy)],
      ],
    });
  }
  bridge?.send("ombrique:canvasEdit", { commands });
}

function commitScale(
  node: SelectedNode,
  handle: HandleId,
  originRect: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
): void {
  if (!isEditableNode(node)) return;
  let x = originRect.x;
  let y = originRect.y;
  let width = originRect.width;
  let height = originRect.height;
  const movesX = handle.includes("w");
  const movesY = handle.includes("n");
  if (movesX) {
    x = originRect.x + dx;
    width = originRect.width - dx;
  }
  if (handle.includes("e")) width = originRect.width + dx;
  if (movesY) {
    y = originRect.y + dy;
    height = originRect.height - dy;
  }
  if (handle.includes("s")) height = originRect.height + dy;
  width = Math.max(1, width);
  height = Math.max(1, height);
  const flags = flagsOf(node);
  const usesAttrsX = flags.attrs.includes("x") && flags.attrs.includes("y");
  const attrsW =
    flags.attrs.includes("width") && flags.attrs.includes("height");
  const target = { file: node.file, start: 0, end: 0, path: node.path };
  const commands: unknown[] = [];
  if (usesAttrsX) {
    const patch: Record<string, number> = {};
    if (movesX) {
      patch.x = Math.round(x);
      patch.y = Math.round(y);
    }
    if (attrsW) {
      patch.width = Math.round(width);
      patch.height = Math.round(height);
    }
    if (Object.keys(patch).length > 0) {
      commands.push({ kind: "setAttrs", target, attrs: patch });
    }
  } else {
    const declarations: Array<[string, number]> = [];
    if (movesX) {
      declarations.push(["left", Math.round(x)]);
      declarations.push(["top", Math.round(y)]);
    }
    declarations.push(["width", Math.round(width)]);
    if (height !== originRect.height || movesY) {
      declarations.push(["height", Math.round(height)]);
    }
    commands.push({
      kind: "setStyle",
      target,
      declarations,
    });
  }
  bridge?.send("ombrique:canvasEdit", { commands });
}

function commitMultiMove(dx: number, dy: number): void {
  const nodes = multiSelection.filter(isEditableNode);
  const commands: unknown[] = [];
  for (const node of nodes) {
    const flags = flagsOf(node);
    const target = { file: node.file, start: 0, end: 0, path: node.path };
    if (flags.attrs.includes("x") && flags.attrs.includes("y")) {
      commands.push({
        kind: "setAttrs",
        target,
        attrs: {
          x: Math.round(node.rect.x + dx),
          y: Math.round(node.rect.y + dy),
        },
      });
    } else {
      commands.push({
        kind: "setStyle",
        target,
        declarations: [
          ["left", Math.round(node.rect.x + dx)],
          ["top", Math.round(node.rect.y + dy)],
        ],
      });
    }
  }
  if (commands.length > 0) bridge?.send("ombrique:canvasEdit", { commands });
}

function previewMove(dx: number, dy: number): void {
  if (!selection || !drag.originRect) return;
  const nodes = multiSelection.length > 1 ? multiSelection : [selection];
  for (const node of nodes) {
    const element = node.element as HTMLElement;
    element.style.position = "absolute";
    element.style.left = `${node.rect.x + dx}px`;
    element.style.top = `${node.rect.y + dy}px`;
  }
  refreshRectsOf(nodes);
  drawOverlay();
}

function previewScale(
  handle: HandleId,
  originRect: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
): void {
  if (!selection) return;
  let x = originRect.x;
  let y = originRect.y;
  let width = originRect.width;
  let height = originRect.height;
  if (handle.includes("w")) {
    x = originRect.x + dx;
    width = originRect.width - dx;
  }
  if (handle.includes("e")) width = originRect.width + dx;
  if (handle.includes("n")) {
    y = originRect.y + dy;
    height = originRect.height - dy;
  }
  if (handle.includes("s")) height = originRect.height + dy;
  width = Math.max(1, width);
  height = Math.max(1, height);
  const element = selection.element as HTMLElement;
  element.style.position = "absolute";
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  selection.rect = { x, y, width, height };
  drawOverlay();
}

function nudge(dx: number, dy: number): void {
  if (multiSelection.length === 0) return;
  for (const node of multiSelection) {
    const element = node.element as HTMLElement;
    element.style.position = "absolute";
    element.style.left = `${node.rect.x + dx}px`;
    element.style.top = `${node.rect.y + dy}px`;
  }
  refreshRectsOf(multiSelection);
  commitMultiMove(dx, dy);
}

function beginTextEdit(): void {
  if (!selection || editingText) return;
  if (!isEditableNode(selection)) return;
  const element = selection.element as HTMLElement;
  if (element.children.length > 0) return;
  editingOriginal = element.textContent ?? "";
  editingText = element;
  element.contentEditable = "true";
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  element.addEventListener("blur", commitTextEdit, { once: true });
  element.addEventListener("keydown", onEditKeyDown);
  drawOverlay();
}

function onEditKeyDown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).blur();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    editingOriginal = "";
    cancelTextEdit();
  }
}

function commitTextEdit(): void {
  if (!editingText || !selection) return;
  const element = editingText;
  const next = element.textContent ?? "";
  element.contentEditable = "false";
  element.removeEventListener("keydown", onEditKeyDown);
  editingText = null;
  const changed = next !== editingOriginal;
  editingOriginal = "";
  if (changed) {
    bridge?.send("ombrique:canvasEdit", {
      commands: [
        {
          kind: "setText",
          target: {
            file: selection.file,
            start: 0,
            end: 0,
            path: selection.path,
          },
          text: next,
        },
      ],
    });
  }
  drawOverlay();
}

function cancelTextEdit(): void {
  if (!editingText) return;
  editingText.contentEditable = "false";
  editingText.removeEventListener("keydown", onEditKeyDown);
  editingText.textContent = editingOriginal || editingText.textContent;
  editingText = null;
  editingOriginal = "";
  drawOverlay();
}

function sendClipboard(kind: "copy" | "cut" | "paste", dx = 0, dy = 0): void {
  bridge?.send("ombrique:clipboardEdit", {
    kind,
    dx,
    dy,
    nodes: multiSelection.map((node) => ({
      file: node.file,
      path: node.path,
    })),
  });
}

function commitDuplicate(nodes: SelectedNode[]): void {
  const editable = nodes.filter(isEditableNode);
  if (editable.length === 0) return;
  const commands: unknown[] = [];
  for (const node of editable) {
    commands.push({
      kind: "duplicateNode",
      target: { file: node.file, start: 0, end: 0, path: node.path },
      dx: 20,
      dy: 20,
    });
  }
  bridge?.send("ombrique:canvasEdit", { commands });
}

function commitDelete(nodes: SelectedNode[]): void {
  const editable = nodes.filter(isEditableNode);
  if (editable.length === 0) return;
  bridge?.send("ombrique:canvasEdit", {
    commands: [
      {
        kind: "deleteNodes",
        targets: editable.map((node) => ({
          file: node.file,
          start: 0,
          end: 0,
          path: node.path,
        })),
      },
    ],
  });
}

async function runPerf500(): Promise<void> {
  if (!compositor) {
    bridge?.send("ombrique:perf500Result", {
      ok: false,
      error: "no compositor",
    });
    return;
  }
  try {
    // Clean up current boards
    for (const [key, board] of boards) {
      board.reactRoot.unmount();
      board.element.remove();
      boards.delete(key);
    }
    const perfBoards: BoardInit[] = [];
    const elements: HTMLElement[] = [];
    const cols = 25;
    const rows = 20;
    const boardW = 320;
    const boardH = 200;
    const gap = 40;

    for (let i = 0; i < 500; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const wx = col * (boardW + gap);
      const wy = row * (boardH + gap);

      const el = document.createElement("section");
      el.className = "board";
      el.setAttribute("drawable", "");
      el.style.cssText = `position:absolute;left:0;top:0;width:${boardW}px;height:${boardH}px;background:#ffffff;transform:translate(${wx}px,${wy}px);display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:14px;color:#333;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-radius:4px;`;
      el.textContent = `Board #${i + 1}`;
      stage.appendChild(el);
      elements.push(el);

      perfBoards.push({
        el,
        worldX: wx,
        worldY: wy,
        worldW: boardW,
        worldH: boardH,
      });
    }

    compositor.setBoards(perfBoards);

    // Collect frame statistics during pan & zoom across the 500 boards
    const fpsSamples: number[] = [];
    let lastPaints = 0;
    let lastUploads = 0;
    let lastVisible = 0;
    const onStatsUnsub = (stats: {
      fps: number;
      visible: number;
      uploads: number;
      paints: number;
    }) => {
      if (stats.fps > 0) fpsSamples.push(stats.fps);
      lastPaints = stats.paints;
      lastUploads = stats.uploads;
      lastVisible = stats.visible;
    };
    // hook into onStats via window temporary handler
    const origOnStats = (
      window as unknown as { __perfOnStats?: typeof onStatsUnsub }
    ).__perfOnStats;
    (
      window as unknown as { __perfOnStats?: typeof onStatsUnsub }
    ).__perfOnStats = onStatsUnsub;

    const totalGridW = cols * (boardW + gap);
    const totalGridH = rows * (boardH + gap);

    // Pan & zoom sequence across 60 animation frames
    for (let frame = 0; frame < 60; frame++) {
      const progress = frame / 60;
      // Pan diagonally across the boards
      camera.x = progress * (totalGridW - 800);
      camera.y = progress * (totalGridH - 600);
      // Oscillate zoom between 0.15 and 0.8
      camera.z = 0.4 + 0.3 * Math.sin(progress * Math.PI * 2);
      compositor.camera.set(camera);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }

    (
      window as unknown as { __perfOnStats?: typeof onStatsUnsub }
    ).__perfOnStats = origOnStats;

    // Calculate percentiles
    fpsSamples.sort((a, b) => a - b);
    const p50 = fpsSamples[Math.floor(fpsSamples.length * 0.5)] ?? 60;
    const p99 =
      fpsSamples[Math.floor(fpsSamples.length * 0.99)] ??
      fpsSamples.at(-1) ??
      60;
    const minFps = fpsSamples[0] ?? 60;
    const maxFps = fpsSamples.at(-1) ?? 60;

    // Clean up perf elements
    for (const el of elements) el.remove();

    bridge?.send("ombrique:perf500Result", {
      ok: true,
      sampleCount: fpsSamples.length,
      p50,
      p99,
      minFps,
      maxFps,
      lastPaints,
      lastUploads,
      lastVisible,
      boards: perfBoards.length,
    });
  } catch (error) {
    bridge?.send("ombrique:perf500Result", {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function init() {
  const host = document.createElement("canvas");
  host.id = "cv";
  host.setAttribute("content", "drawable");
  canvas.replaceWith(host);
  stage = host;
  compositor = await createCompositor(host, {
    onStats: (stats) => {
      bridge?.send("ombrique:stats", stats);
      (
        window as unknown as { __perfOnStats?: (s: typeof stats) => void }
      ).__perfOnStats?.(stats);
    },
  });
  compositor.camera.set(camera);

  const toolRoot = document.createElement("div");
  toolRoot.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:10";
  const toolMount = document.createElement("div");
  toolMount.style.cssText =
    "position:absolute;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:auto";
  toolRoot.appendChild(toolMount);
  document.body.appendChild(toolRoot);
  const toolRoot2 = createRoot(toolMount);
  const renderToolSwitcher = () => {
    toolRoot2.render(
      createElement(FloatingToolSwitcher, {
        activeTool: toolMode,
        onSelectTool: (tool: "select" | "hand") => {
          toolMode = tool;
          bridge?.send("ombrique:toolChanged", { tool });
          renderToolSwitcher();
        },
      }),
    );
  };
  renderToolSwitcher();

  window.addEventListener("keydown", (event) => {
    if (editingText) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "v" || event.key === "V") {
      if (mod) return;
      toolMode = "select";
      renderToolSwitcher();
      return;
    }
    if (event.key === "h" || event.key === "H") {
      if (mod) return;
      toolMode = "hand";
      renderToolSwitcher();
      return;
    }
    if (event.key === "Escape") {
      toolMode = "select";
      selectSingle(null);
      return;
    }
    if (event.code === "Space") {
      spacePressed = true;
      event.preventDefault();
      return;
    }
    if (mod && event.key.toLowerCase() === "c") {
      event.preventDefault();
      sendClipboard("copy");
      return;
    }
    if (mod && event.key.toLowerCase() === "x") {
      event.preventDefault();
      sendClipboard("cut");
      return;
    }
    if (mod && event.key.toLowerCase() === "v") {
      event.preventDefault();
      sendClipboard("paste", 20, 20);
      return;
    }
    if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      commitDuplicate(multiSelection);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      commitDelete(multiSelection);
      selectSingle(null);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(-step, 0);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(step, 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudge(0, -step);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nudge(0, step);
      return;
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") spacePressed = false;
  });

  host.addEventListener("pointerdown", (event) => {
    if (editingText) return;
    const isModifier = event.shiftKey || event.ctrlKey || event.metaKey;
    if (event.button === 1 || spacePressed || toolMode === "hand") {
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved = false;
      return;
    }
    const handle = handleAtPoint(event.clientX, event.clientY);
    if (
      handle &&
      selection &&
      isEditableNode(selection) &&
      multiSelection.length <= 1
    ) {
      drag.mode = "scale";
      drag.handle = handle;
      drag.originRect = { ...selection.rect };
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved = false;
      return;
    }
    const hit = hitTest(event.clientX, event.clientY);
    if (isModifier && hit) {
      toggleInSelection(hit);
      return;
    }
    if (hit && multiSelection.some((s) => s.element === hit.element)) {
      if (multiSelection.every(isEditableNode)) {
        drag.mode = "move";
        drag.originRect = selection ? { ...selection.rect } : null;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved = false;
        return;
      }
    }
    if (hit) {
      selectSingle(hit);
      if (isEditableNode(hit)) {
        drag.mode = "move";
        drag.originRect = { ...hit.rect };
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved = false;
      }
      return;
    }
    const wx = event.clientX / camera.z + camera.x;
    const wy = event.clientY / camera.z + camera.y;
    drag.mode = "pan";
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved = false;
    marquee = { x0: wx, y0: wy, x1: wx, y1: wy };
  });
  host.addEventListener("pointermove", (event) => {
    if (drag.mode === "none" || editingText) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
    if (marquee) {
      const wx = event.clientX / camera.z + camera.x;
      const wy = event.clientY / camera.z + camera.y;
      marquee.x1 = wx;
      marquee.y1 = wy;
      drawOverlay();
      return;
    }
    if (drag.mode === "pan") {
      camera.x -= dx / camera.z;
      camera.y -= dy / camera.z;
      drag.x = event.clientX;
      drag.y = event.clientY;
      compositor?.camera.set(camera);
      refreshSelectionRect();
      drawOverlay();
      return;
    }
    if (drag.mode === "move" && selection && drag.originRect) {
      previewMove(dx / camera.z, dy / camera.z);
      return;
    }
    if (drag.mode === "scale" && selection && drag.handle && drag.originRect) {
      previewScale(drag.handle, drag.originRect, dx / camera.z, dy / camera.z);
    }
  });
  const endDrag = (event: PointerEvent) => {
    if (drag.mode === "none") return;
    const dx = (event.clientX - drag.x) / camera.z;
    const dy = (event.clientY - drag.y) / camera.z;
    const origin = drag.originRect;
    if (marquee) {
      const mx = Math.min(marquee.x0, marquee.x1);
      const my = Math.min(marquee.y0, marquee.y1);
      const mw = Math.abs(marquee.x1 - marquee.x0);
      const mh = Math.abs(marquee.y1 - marquee.y0);
      const mRect = { x: mx, y: my, width: mw, height: mh };
      marquee = null;
      if (mw > 4 || mh > 4) {
        const found: SelectedNode[] = [];
        for (const [element, info] of nodeIndex) {
          if (element.tagName.toLowerCase() === "section") continue;
          const b = element.getBoundingClientRect();
          const eRect = {
            x: b.left / camera.z + camera.x,
            y: b.top / camera.z + camera.y,
            width: b.width / camera.z,
            height: b.height / camera.z,
          };
          if (
            eRect.x < mRect.x + mRect.width &&
            eRect.x + eRect.width > mRect.x &&
            eRect.y < mRect.y + mRect.height &&
            eRect.y + eRect.height > mRect.y
          ) {
            found.push({
              file: info.file,
              path: info.path,
              tag: element.tagName.toLowerCase(),
              name: element.getAttribute("data-name"),
              rect: eRect,
              element,
            });
          }
        }
        if (found.length > 0) {
          multiSelection = found;
          selection = found[0] ?? null;
          emitSelection();
        } else {
          selectSingle(null);
        }
        drawOverlay();
      } else {
        selectSingle(null);
      }
    } else if (drag.mode === "move" && selection && drag.moved && origin) {
      if (multiSelection.length > 1) {
        commitMultiMove(dx, dy);
      } else {
        commitMove(selection, dx, dy);
      }
    } else if (
      drag.mode === "scale" &&
      selection &&
      drag.handle &&
      drag.moved &&
      origin
    ) {
      commitScale(selection, drag.handle, origin, dx, dy);
    }
    drag.mode = "none";
    drag.handle = null;
    drag.originRect = null;
    drag.moved = false;
  };
  host.addEventListener("pointerup", endDrag);
  host.addEventListener("pointercancel", () => {
    drag.mode = "none";
    drag.handle = null;
    drag.originRect = null;
    drag.moved = false;
    marquee = null;
    drawOverlay();
  });
  host.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      const next = compositor?.camera.zoomAt(
        factor,
        event.clientX,
        event.clientY,
      );
      if (next) {
        camera.x = next.x;
        camera.y = next.y;
        camera.z = next.z;
      }
      refreshSelectionRect();
      drawOverlay();
      emitZoom();
    },
    { passive: false },
  );
  host.addEventListener("dblclick", (event) => {
    const hit = hitTest(event.clientX, event.clientY);
    if (!hit) return;
    selectSingle(hit);
    beginTextEdit();
  });

  bridge?.onProject((message) => {
    manifest = message.manifest;
    for (const [key, board] of boards) {
      board.reactRoot.unmount();
      board.element.remove();
      void key;
    }
    boards.clear();
    nodeIndex.clear();
    selection = null;
    multiSelection = [];
    drawOverlay();
    const first = message.manifest.pages[0];
    if (first) void mountPage(first.file);
    bridge?.send("ombrique:ready", true);
  });

  bridge?.onManifest((payload) => {
    const next = payload as Manifest | null;
    if (!next) return;
    manifest = next;
  });

  bridge?.onPage((pageId) => {
    if (!manifest) return;
    const page =
      manifest.pages.find((entry) => entry.id === pageId) ?? manifest.pages[0];
    if (!page) return;
    nodeIndex.clear();
    void mountPage(page.file);
  });

  async function handleExport(req: {
    file: string;
    outPath: string;
    path?: number[];
    format?: "png" | "jpg" | "webp" | "svg";
    scale?: 1 | 2 | 3;
  }) {
    const scale = req.scale ?? 2;
    const format = req.format ?? "png";

    if (format === "svg") {
      let targetEl: HTMLElement | SVGElement | null = null;
      if (req.path) {
        const targetPathStr = req.path.join("/");
        for (const [el, info] of nodeIndex) {
          if (info.file === req.file && info.path.join("/") === targetPathStr) {
            targetEl = el as HTMLElement | SVGElement;
            break;
          }
        }
      }
      if (!targetEl) {
        const board = boards.get(req.file);
        targetEl =
          board?.element.querySelector("svg") ?? board?.element ?? null;
      }
      if (!targetEl) {
        bridge?.send("ombrique:exportResult", {
          outPath: req.outPath,
          ok: false,
        });
        return;
      }
      const clone = targetEl.cloneNode(true) as HTMLElement | SVGElement;
      const removeDataAttrs = (node: Element) => {
        for (const attr of Array.from(node.attributes)) {
          if (attr.name.startsWith("data-") || attr.name === "data-name") {
            node.removeAttribute(attr.name);
          }
        }
        for (const child of Array.from(node.children)) {
          removeDataAttrs(child);
        }
      };
      removeDataAttrs(clone);
      let svgStr = clone.outerHTML;
      svgStr = svgStr.replace(/var\((--[^)]+)\)/g, (_match, tokenName) => {
        return (
          getComputedStyle(document.documentElement)
            .getPropertyValue(tokenName)
            .trim() || "#111111"
        );
      });
      const bytes = new TextEncoder().encode(svgStr).buffer;
      bridge?.send("ombrique:exportResult", {
        outPath: req.outPath,
        ok: true,
        bytes,
      });
      return;
    }

    const board = boards.get(req.file);
    if (!board || !compositor) {
      bridge?.send("ombrique:exportResult", {
        outPath: req.outPath,
        ok: false,
      });
      return;
    }
    const result = await compositor.exportBoard(board.element, scale);
    if (!result) {
      bridge?.send("ombrique:exportResult", {
        outPath: req.outPath,
        ok: false,
      });
      return;
    }
    const off = new OffscreenCanvas(result.width, result.height);
    const ctx2d = off.getContext("2d");
    if (!ctx2d) return;
    ctx2d.putImageData(
      new ImageData(
        new Uint8ClampedArray(result.rgba),
        result.width,
        result.height,
      ),
      0,
      0,
    );
    const mime =
      format === "jpg"
        ? "image/jpeg"
        : format === "webp"
          ? "image/webp"
          : "image/png";
    const blob = await off.convertToBlob({ type: mime });
    const bytes = await blob.arrayBuffer();
    bridge?.send("ombrique:exportResult", {
      outPath: req.outPath,
      ok: true,
      bytes,
    });
  }

  bridge?.onViewCommand((payload) => {
    const command = payload as { channel?: string; payload?: unknown } | null;
    if (command?.channel === "ombrique:perf500") {
      void runPerf500();
      return;
    }
    if (command?.channel === "ombrique:export") {
      const req = command.payload as {
        file: string;
        outPath: string;
        path?: number[];
        format?: "png" | "jpg" | "webp" | "svg";
        scale?: 1 | 2 | 3;
      } | null;
      if (req) void handleExport(req);
      return;
    }
    if (command?.channel === "ombrique:zoomToFit") {
      fitToViewport();
      return;
    }
    if (command?.channel === "ombrique:resolvedProps") {
      const data = command.payload as {
        file?: string;
        path?: number[];
        attrs?: string[];
        locked?: boolean;
        generated?: boolean;
      } | null;
      if (data?.file && Array.isArray(data?.path)) {
        nodeProps.set(nodeKeyOf(data.file, data.path), {
          attrs: data.attrs ?? [],
          locked: Boolean(data.locked),
          generated: Boolean(data.generated),
        });
        drawOverlay();
      }
      return;
    }
    if (command?.channel === "ombrique:toolChanged") {
      const tool = command.payload as "select" | "hand" | null;
      if (tool === "select" || tool === "hand") toolMode = tool;
      return;
    }
    if (command?.channel === "ombrique:selectNode") {
      const req = command.payload as { file?: string; path?: number[] } | null;
      if (!req?.file || !req.path) return;
      const node = selectionElementOf(req.file, req.path);
      selectSingle(node);
      return;
    }
    if (command?.channel !== "ombrique:zoom") return;
    const factor = Number(command.payload);
    if (!Number.isFinite(factor)) return;
    const current = compositor?.camera.get();
    if (!current) return;
    const bounds = stage.getBoundingClientRect();
    const next = compositor?.camera.zoomAt(
      factor / current.z,
      bounds.width / 2,
      bounds.height / 2,
    );
    if (next) {
      camera.x = next.x;
      camera.y = next.y;
      camera.z = next.z;
      refreshSelectionRect();
      drawOverlay();
      emitZoom();
    }
  });

  bridge?.onHmr((payload) => {
    if (!manifest) return;
    if (payload.type !== "update" && payload.type !== "full-reload") return;
    nodeIndex.clear();
    for (const board of boards.values()) {
      board.reactRoot.unmount();
      board.element.remove();
    }
    boards.clear();
    const active =
      manifest.pages.find((page) => page.file === currentFile) ??
      manifest.pages[0];
    if (active) void mountPage(active.file);
  });
}

void init();
