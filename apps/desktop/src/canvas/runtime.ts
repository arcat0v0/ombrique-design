import { createRoot, type Root } from "react-dom/client";
import { createElement, type ComponentType } from "react";
import { FloatingToolSwitcher, type CanvasTool } from "@ombrique/editor-ui";
import type { CommentThread, Manifest } from "@ombrique/protocol";
import {
  createCompositor,
  type BoardInit,
  type Compositor,
  getAnchorPoints,
  getControlHandles,
  moveAnchorPoint,
  moveControlHandle,
  deleteAnchorPoint,
  addPointToPath,
  type Point,
  type EqualSpacingGuide,
  type GuideFeature,
  type ReferenceLine,
  type SmartGuideLine,
  type SnapResult,
  collectEqualGaps,
  snapRectToGuides,
} from "@ombrique/canvas";
import {
  type LayoutHandle,
  type PaddingEdge,
  computeLayoutHandles,
  getAutoLayoutInfo,
  layoutHandleAtPoint,
  referenceLineAtPoint,
  renderAltMeasurementsOverlay,
  renderLayoutHandlesOverlay,
  renderReferenceLinesOverlay,
  renderRulersOverlay,
  renderSmartGuidesOverlay,
} from "./interactions";
import { worldRectFromClientRect, type WorldRect } from "./selection-geometry";
import { serializeNodeToSvg } from "./export-node";
interface CanvasBridge {
  onProject: (cb: (payload: ProjectMessage) => void) => void;
  onFiles: (cb: (payload: unknown) => void) => void;
  onHmr: (cb: (payload: HmrPayload) => void) => void;
  onCommandFailed: (cb: (payload: unknown) => void) => void;
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

type DragMode =
  | "none"
  | "pan"
  | "move"
  | "scale"
  | "create"
  | "pen"
  | "pathAnchor"
  | "pathHandle"
  | "reference"
  | "gap"
  | "padding";
type CreateTool = Exclude<CanvasTool, "select" | "hand" | "pen">;

function isCreateTool(tool: CanvasTool): tool is CreateTool {
  return tool !== "select" && tool !== "hand" && tool !== "pen";
}
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

const tokensStyleElement = document.createElement("style");
tokensStyleElement.id = "ombrique-tokens";
document.head.appendChild(tokensStyleElement);

let tokensCssSource: string | null = null;

function aliasDefaultTokenMode(sheet: CSSStyleSheet | null) {
  if (!sheet) return;
  const rootRules: CSSStyleRule[] = [];
  for (const rule of Array.from(sheet.cssRules)) {
    if (!(rule instanceof CSSStyleRule)) continue;
    const selectors = rule.selectorText.split(",").map((s) => s.trim());
    if (!selectors.includes(":root")) continue;
    if (selectors.some((s) => s.startsWith("[data-mode"))) return;
    rootRules.push(rule);
  }
  for (const rule of rootRules) {
    rule.selectorText = `${rule.selectorText}, [data-mode="default"]`;
  }
}

function applyTokensCss(files: unknown) {
  if (!files || typeof files !== "object") return;
  const css = (files as Record<string, unknown>)["tokens.css"];
  const next = typeof css === "string" ? css : "";
  if (tokensCssSource === next) return;
  tokensCssSource = next;
  tokensStyleElement.textContent = next;
  aliasDefaultTokenMode(tokensStyleElement.sheet);
  compositor?.requestPaint();
}

const canvasElement = document.getElementById("cv");
const overlayElement = document.getElementById("overlay");

if (!canvasElement || !overlayElement)
  throw new Error("canvas host markup missing");

const canvas: HTMLElement = canvasElement;
const overlay: HTMLElement = overlayElement;
let stage: HTMLElement = canvas;

const boards = new Map<string, { element: HTMLElement; reactRoot: Root }>();
const boardScales = new Map<Element, number>();
const nodeIndex = new Map<Element, { file: string; path: number[] }>();
let manifest: Manifest | null = null;
let commentThreads: CommentThread[] = [];
let compositor: Compositor | null = null;
let selection: SelectedNode | null = null;
let multiSelection: SelectedNode[] = [];
let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
let createPreview: { x0: number; y0: number; x1: number; y1: number } | null =
  null;
let currentFile: string | null = null;
let firstMount = true;
let spacePressed = false;
let toolMode: CanvasTool = "select";
let activateTool: (tool: CanvasTool) => void = () => {};
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
  pathAnchorIndex?: number;
  pathHandleIndex?: number;
  originalD?: string;
  currentD?: string;
  originPoint?: Point;
  snappedDx?: number;
  snappedDy?: number;
  activeReference?: ReferenceLine | null;
  activeLayoutHandle?: LayoutHandle | null;
  originValue?: number;
  nodeOrigins?: Map<string, { x: number; y: number }>;
  restores?: Array<() => void>;
} = {
  mode: "none",
  x: 0,
  y: 0,
  moved: false,
  handle: null,
  originRect: null,
  restores: undefined,
};

let pendingDragRestores: Array<() => void> | null = null;

interface PointerMoveSnapshot {
  clientX: number;
  clientY: number;
  altKey: boolean;
  target: EventTarget | null;
}

let pendingPointerMove: PointerMoveSnapshot | null = null;
let pointerMoveRaf = 0;

const referenceLines: ReferenceLine[] = [];
let altPressed = false;
let hoveredNode: SelectedNode | null = null;
let lastMouseClient: { x: number; y: number } | null = null;
let currentLayoutHandles: LayoutHandle[] = [];
let activeSmartGuides: {
  lines: SmartGuideLine[];
  spacing: EqualSpacingGuide[];
} | null = null;
let activeReferenceLine: ReferenceLine | null = null;
let activeLayoutHandle: LayoutHandle | null = null;
let prototypeMode = false;
let showHotspots = false;
const prototypeHistory: string[] = [];
let prototypeFlashTimer: number | undefined;
let prototypeHotspotsFlashing = false;
let prototypeBarElement: HTMLElement | null = null;
const originalHoverStyles = new WeakMap<HTMLElement, string>();
let lastHoveredPrototypeEl: HTMLElement | null = null;

function commitGap(node: SelectedNode, value: number): void {
  if (!isEditableNode(node)) return;
  const flags = flagsOf(node);
  const target = { file: node.file, start: 0, end: 0, path: node.path };
  const commands: unknown[] = [];
  if (flags.attrs.includes("gap")) {
    commands.push({ kind: "setAttrs", target, attrs: { gap: value } });
  } else {
    commands.push({
      kind: "setStyle",
      target,
      declarations: [["gap", value]],
    });
  }
  bridge?.send("ombrique:canvasEdit", { commands });
}

function commitPadding(
  node: SelectedNode,
  edge: PaddingEdge,
  value: number,
): void {
  if (!isEditableNode(node)) return;
  const flags = flagsOf(node);
  const target = { file: node.file, start: 0, end: 0, path: node.path };
  const propName =
    edge === "top"
      ? "paddingTop"
      : edge === "right"
        ? "paddingRight"
        : edge === "bottom"
          ? "paddingBottom"
          : "paddingLeft";
  const commands: unknown[] = [];
  if (flags.attrs.includes("padding")) {
    commands.push({ kind: "setAttrs", target, attrs: { padding: value } });
  } else {
    commands.push({
      kind: "setStyle",
      target,
      declarations: [[propName, value]],
    });
  }
  bridge?.send("ombrique:canvasEdit", { commands });
}

let guideTargetsCache: Array<{
  x: number;
  y: number;
  width: number;
  height: number;
}> | null = null;

function invalidateGuideTargets(): void {
  guideTargetsCache = null;
}

function collectGuideTargets(): Array<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  if (guideTargetsCache) return guideTargetsCache;
  const targets: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  const selectedElements = new Set(multiSelection.map((s) => s.element));
  if (selection) selectedElements.add(selection.element);
  for (const [el] of nodeIndex) {
    if (!el.isConnected) continue;
    if (selectedElements.has(el)) continue;
    if (
      el.tagName.toLowerCase() === "section" &&
      el.classList.contains("board")
    ) {
      continue;
    }
    const r = worldRectOf(el);
    if (r.width > 0 && r.height > 0) {
      targets.push(r);
    }
  }
  guideTargetsCache = targets;
  return targets;
}

function drawSmartGuides(
  dragRect?: { x: number; y: number; width: number; height: number },
  allTargets?: Array<{ x: number; y: number; width: number; height: number }>,
  options?: {
    threshold?: number;
    xFeatures?: GuideFeature[];
    yFeatures?: GuideFeature[];
  },
): SnapResult | null {
  const currentRect = dragRect ?? (selection ? syncNodeRect(selection) : null);
  if (!currentRect) return null;

  const targets = allTargets ?? collectGuideTargets();

  const equalGaps = collectEqualGaps(targets);
  const threshold = options?.threshold ?? 6 / camera.z;
  const snap = snapRectToGuides(currentRect, targets, {
    threshold,
    references: referenceLines,
    equalGaps,
    xFeatures: options?.xFeatures,
    yFeatures: options?.yFeatures,
  });

  renderSmartGuidesOverlay(overlay, camera, snap.lines, snap.spacing);
  return snap;
}

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

function snapshotNodeDragRestore(node: SelectedNode): () => void {
  const element = node.element as HTMLElement;
  const rect = { ...node.rect };
  const style = element.getAttribute("style");
  return () => {
    if (style === null) element.removeAttribute("style");
    else element.setAttribute("style", style);
    node.rect = { ...rect };
  };
}

function beginDragSnapshot(nodes: SelectedNode[]): void {
  drag.restores = nodes.map(snapshotNodeDragRestore);
}

function selectSingle(node: SelectedNode | null): void {
  selection = node;
  multiSelection = node ? [node] : [];
  invalidateGuideTargets();
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
  invalidateGuideTargets();
  emitSelection();
  drawOverlay();
}

let lastEmittedZoomPercent = -1;

function emitZoom() {
  const percent = Math.round(camera.z * 100);
  if (percent === lastEmittedZoomPercent) return;
  lastEmittedZoomPercent = percent;
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
  if (element.getAttribute("data-primitive") === "path") return;
  for (const child of Array.from(element.children))
    registerSubtree(child, board, file);
}

interface PenPoint {
  anchor: { x: number; y: number };
  handleIn?: { x: number; y: number } | null;
  handleOut?: { x: number; y: number } | null;
}

let penDraft: {
  points: PenPoint[];
  currentPoint: { x: number; y: number } | null;
  draggingHandle: boolean;
} | null = null;

function buildPathD(
  points: Array<{
    anchor: { x: number; y: number };
    handleIn?: { x: number; y: number } | null;
    handleOut?: { x: number; y: number } | null;
  }>,
  closed: boolean,
): string {
  const first = points[0];
  if (!first) return "";
  let d = `M ${first.anchor.x} ${first.anchor.y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!curr) continue;
    if (prev?.handleOut || curr.handleIn) {
      const cp1 = prev?.handleOut ?? prev?.anchor ?? { x: 0, y: 0 };
      const cp2 = curr.handleIn ?? curr.anchor;
      d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${curr.anchor.x} ${curr.anchor.y}`;
    } else {
      d += ` L ${curr.anchor.x} ${curr.anchor.y}`;
    }
  }
  if (closed && points.length > 2) {
    const prev = points[points.length - 1];
    if (prev?.handleOut || first.handleIn) {
      const cp1 = prev?.handleOut ?? prev?.anchor ?? { x: 0, y: 0 };
      const cp2 = first.handleIn ?? first.anchor;
      d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${first.anchor.x} ${first.anchor.y} Z`;
    } else {
      d += " Z";
    }
  }
  return d;
}

function finishPenPath(closed = false) {
  if (!penDraft || penDraft.points.length < 2 || !currentFile) {
    penDraft = null;
    drawOverlay();
    return;
  }
  const board = boards.get(currentFile);
  if (!board) {
    penDraft = null;
    drawOverlay();
    return;
  }
  const pts = penDraft.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of pts) {
    minX = Math.min(minX, pt.anchor.x);
    minY = Math.min(minY, pt.anchor.y);
    maxX = Math.max(maxX, pt.anchor.x);
    maxY = Math.max(maxY, pt.anchor.y);
    if (pt.handleIn) {
      minX = Math.min(minX, pt.handleIn.x);
      minY = Math.min(minY, pt.handleIn.y);
      maxX = Math.max(maxX, pt.handleIn.x);
      maxY = Math.max(maxY, pt.handleIn.y);
    }
    if (pt.handleOut) {
      minX = Math.min(minX, pt.handleOut.x);
      minY = Math.min(minY, pt.handleOut.y);
      maxX = Math.max(maxX, pt.handleOut.x);
      maxY = Math.max(maxY, pt.handleOut.y);
    }
  }

  const x = Math.round(minX);
  const y = Math.round(minY);
  const width = Math.max(1, Math.round(maxX - minX));
  const height = Math.max(1, Math.round(maxY - minY));

  const normalizedPoints = pts.map((pt) => ({
    anchor: { x: Math.round(pt.anchor.x - x), y: Math.round(pt.anchor.y - y) },
    handleIn: pt.handleIn
      ? { x: Math.round(pt.handleIn.x - x), y: Math.round(pt.handleIn.y - y) }
      : null,
    handleOut: pt.handleOut
      ? { x: Math.round(pt.handleOut.x - x), y: Math.round(pt.handleOut.y - y) }
      : null,
  }));

  const d = buildPathD(normalizedPoints, closed);
  penDraft = null;
  drag.mode = "none";

  bridge?.send("ombrique:canvasEdit", {
    commands: [
      {
        kind: "createNodes",
        parent: null,
        pageFile: currentFile,
        index: 0,
        specs: [
          {
            kind: "path",
            name: "Path",
            x,
            y,
            width,
            height,
            d,
            stroke: "#000000",
            strokeWidth: 2,
            fill: "none",
          },
        ],
      },
    ],
  });
  activateTool("select");
  drawOverlay();
}

function getPathData(node: SelectedNode | null): string | null {
  if (!node) return null;
  const el = node.element;
  return (
    el.getAttribute("data-d") ??
    el.getAttribute("d") ??
    el.querySelector("path")?.getAttribute("d") ??
    null
  );
}

function isPathNode(node: SelectedNode | null): boolean {
  if (!node) return false;
  return (
    node.element.getAttribute("data-primitive") === "path" ||
    node.element.hasAttribute("data-d") ||
    node.element.querySelector("path") !== null ||
    node.element.tagName.toLowerCase() === "path"
  );
}

function applyPathD(node: SelectedNode, d: string): void {
  node.element.setAttribute("data-d", d);
  const pathEl = node.element.querySelector("path");
  if (pathEl) pathEl.setAttribute("d", d);
}

function findPathHandleAtPoint(
  clientX: number,
  clientY: number,
): { anchorIndex: number; handleIndex: number; point: Point } | null {
  if (!selection || !isPathNode(selection)) return null;
  revalidateSelection();
  if (!selection || !isPathNode(selection)) return null;
  const rect = syncNodeRect(selection);
  const d = getPathData(selection);
  if (!d) return null;
  try {
    const handles = getControlHandles(d);
    for (const h of handles) {
      const sx = (rect.x + h.point.x - camera.x) * camera.z;
      const sy = (rect.y + h.point.y - camera.y) * camera.z;
      if (Math.hypot(clientX - sx, clientY - sy) <= 8) {
        return h;
      }
    }
  } catch {}
  return null;
}

function findPathAnchorAtPoint(
  clientX: number,
  clientY: number,
): { index: number; point: Point } | null {
  if (!selection || !isPathNode(selection)) return null;
  revalidateSelection();
  if (!selection || !isPathNode(selection)) return null;
  const rect = syncNodeRect(selection);
  const d = getPathData(selection);
  if (!d) return null;
  try {
    const anchors = getAnchorPoints(d);
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      if (!a) continue;
      const sx = (rect.x + a.x - camera.x) * camera.z;
      const sy = (rect.y + a.y - camera.y) * camera.z;
      if (Math.hypot(clientX - sx, clientY - sy) <= 8) {
        return { index: i, point: a };
      }
    }
  } catch {}
  return null;
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

function boardWorldOrigin(element: Element): { x: number; y: number } {
  const board = element.closest<HTMLElement>(".board");
  if (!board) return { x: 0, y: 0 };
  const file = board.dataset.file;
  const boardEntry = file ? boards.get(file) : undefined;
  if (!boardEntry) return { x: 0, y: 0 };
  let x = 0;
  for (const [, entry] of boards) {
    if (entry === boardEntry) return { x, y: 0 };
    x += entry.element.offsetWidth + 60;
  }
  return { x: 0, y: 0 };
}

function boardAppliedScale(board: HTMLElement): number {
  const bounds = board.getBoundingClientRect();
  const width = board.offsetWidth;
  if (width <= 0) return 1;
  const scale = bounds.width / width;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function worldRectOf(element: Element): WorldRect {
  const board = element.closest<HTMLElement>(".board");
  if (!board) {
    return worldRectFromClientRect(
      element.getBoundingClientRect(),
      {
        rect: { left: 0, top: 0, width: 0, height: 0 },
        origin: { x: camera.x, y: camera.y },
      },
      camera.z,
    );
  }
  return worldRectFromClientRect(
    element.getBoundingClientRect(),
    { rect: board.getBoundingClientRect(), origin: boardWorldOrigin(element) },
    boardAppliedScale(board),
  );
}

function syncNodeRect(node: SelectedNode): WorldRect {
  node.rect = worldRectOf(node.element);
  return node.rect;
}

function resolveLiveNode(node: SelectedNode): SelectedNode | null {
  if (node.element.isConnected) return node;
  const resolved = selectionElementOf(node.file, node.path);
  if (!resolved || resolved.tag !== node.tag) return null;
  return {
    ...node,
    element: resolved.element,
    name: resolved.name,
    rect: resolved.rect,
  };
}

function revalidateSelection(): void {
  if (
    (selection === null || selection.element.isConnected) &&
    multiSelection.every((node) => node.element.isConnected)
  ) {
    return;
  }
  const keyOf = (node: SelectedNode) => nodeKeyOf(node.file, node.path);
  const before = selection
    ? [keyOf(selection), ...multiSelection.map(keyOf)].join("|")
    : "";
  let replaced = false;
  const resolve = (node: SelectedNode) => {
    const next = resolveLiveNode(node);
    if (next !== node) replaced = true;
    return next;
  };
  const live = multiSelection.map(resolve);
  multiSelection = live.filter((node): node is SelectedNode => node !== null);
  selection = selection ? resolve(selection) : null;
  if (!selection && multiSelection.length > 0) {
    selection = multiSelection.at(-1) ?? null;
  }
  if (!selection) multiSelection = [];
  const after =
    selection !== null
      ? [keyOf(selection), ...multiSelection.map(keyOf)].join("|")
      : "";
  if (replaced) invalidateGuideTargets();
  if (replaced || before !== after) emitSelection();
}

function refreshSelectionRect(): void {
  revalidateSelection();
  for (const node of multiSelection) syncNodeRect(node);
}

function refreshRectsOf(nodes: SelectedNode[]): void {
  for (const node of nodes) syncNodeRect(node);
}
function updateBoardResolutions(): void {
  if (!compositor) return;
  const dpr = globalThis.devicePixelRatio || 1;
  const desiredScale = Math.max(1, Math.min(4, Math.ceil(camera.z * dpr)));
  for (const board of boards.values()) {
    const el = board.element;
    const currentScale = boardScales.get(el) ?? 1;
    if (desiredScale === currentScale) continue;
    boardScales.set(el, desiredScale);
    compositor.uploadAtScale(el, desiredScale);
  }
}

function beginNodeInteraction(): void {
  invalidateGuideTargets();
  compositor?.setInteractive(true);
}

function endNodeInteraction(): void {
  compositor?.setInteractive(false);
  invalidateGuideTargets();
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
  updateBoardResolutions();
  emitZoom();
  drawOverlay();
}

async function mountPage(file: string) {
  if (!manifest) return;
  currentFile = file;
  for (const [key, board] of boards) {
    if (key === file) continue;
    boardScales.delete(board.element);
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
  invalidateGuideTargets();

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
  updateBoardResolutions();
  refreshSelectionRect();
  drawOverlay();
}

function triggerHotspotFlash(): void {
  prototypeHotspotsFlashing = true;
  drawOverlay();
  clearTimeout(prototypeFlashTimer);
  prototypeFlashTimer = window.setTimeout(() => {
    prototypeHotspotsFlashing = false;
    drawOverlay();
  }, 500);
}

function drawHotspotOverlays(): void {
  const elements = document.querySelectorAll<HTMLElement>(
    ".board [data-prototype-navigate]",
  );
  for (const el of elements) {
    const rect = worldRectOf(el);
    const box = document.createElement("div");
    box.className = "prototype-hotspot";
    box.style.position = "absolute";
    box.style.left = `${(rect.x - camera.x) * camera.z}px`;
    box.style.top = `${(rect.y - camera.y) * camera.z}px`;
    box.style.width = `${rect.width * camera.z}px`;
    box.style.height = `${rect.height * camera.z}px`;
    box.style.backgroundColor = "rgba(76, 141, 255, 0.22)";
    box.style.border = "1.5px dashed #4c8dff";
    box.style.borderRadius = "3px";
    box.style.pointerEvents = "none";
    box.style.boxSizing = "border-box";
    overlay.appendChild(box);
  }
}

function drawCommentPins(): void {
  if (commentThreads.length === 0 || !currentFile) return;
  const board = boards.get(currentFile);
  if (!board) return;
  const pageId = manifest?.pages.find((page) => page.file === currentFile)?.id;
  const origin = boardWorldOrigin(board.element);
  const size = 22;
  let index = 0;
  for (const thread of commentThreads) {
    const anchor = thread.anchor;
    if (anchor.pageId && pageId && anchor.pageId !== pageId) continue;
    if (anchor.x === undefined || anchor.y === undefined) continue;
    index += 1;
    const wx = origin.x + anchor.x;
    const wy = origin.y + anchor.y;
    const pin = document.createElement("div");
    pin.className = "comment-pin";
    pin.dataset.threadId = thread.id;
    pin.style.cssText = `position:absolute;left:${(wx - camera.x) * camera.z - size / 2}px;top:${(wy - camera.y) * camera.z - size / 2}px;width:${size}px;height:${size}px;border-radius:9999px;background:#f59e0b;border:2px solid #1f1f27;color:#1a1a22;font-size:11px;font-weight:600;font-family:sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);pointer-events:auto;cursor:pointer;z-index:22;user-select:none;opacity:${thread.resolved ? 0.45 : 1};`;
    pin.textContent = String(index);
    pin.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      bridge?.send("ombrique:commentSelected", { threadId: thread.id });
    });
    overlay.appendChild(pin);
  }
}

function drawPrototypeConnectionLine(
  fromNode: SelectedNode,
  targetPageId: string,
): void {
  if (!manifest) return;
  const targetPage = manifest.pages.find(
    (p) =>
      p.id === targetPageId ||
      p.file === targetPageId ||
      p.name === targetPageId,
  );
  if (!targetPage) return;

  const currentBoard = currentFile ? boards.get(currentFile)?.element : null;
  const origin = boardWorldOrigin(fromNode.element);
  const currentBoardW = currentBoard?.offsetWidth ?? 1440;

  const rect = syncNodeRect(fromNode);
  const startX = (rect.x + rect.width - camera.x) * camera.z;
  const startY = (rect.y + rect.height / 2 - camera.y) * camera.z;

  let targetWorldX: number;
  let targetWorldY: number;

  const targetBoard = boards.get(targetPage.file)?.element;
  if (targetBoard && targetBoard !== currentBoard) {
    const tOrigin = boardWorldOrigin(targetBoard);
    targetWorldX = tOrigin.x;
    targetWorldY = tOrigin.y + 80;
  } else {
    const currentIdx = manifest.pages.findIndex((p) => p.file === currentFile);
    const targetIdx = manifest.pages.findIndex(
      (p) =>
        p.id === targetPageId ||
        p.file === targetPageId ||
        p.name === targetPageId,
    );
    const delta =
      targetIdx !== -1 && currentIdx !== -1 ? targetIdx - currentIdx : 1;
    targetWorldX = origin.x + (delta !== 0 ? delta : 1) * (currentBoardW + 180);
    targetWorldY = origin.y + 40;
  }

  const endX = (targetWorldX - camera.x) * camera.z;
  const endY = (targetWorldY - camera.y) * camera.z;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  svg.style.overflow = "visible";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "marker",
  );
  marker.id = "prototype-arrow";
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "7");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto-start-reverse");

  const arrowPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  arrowPath.setAttribute("d", "M 0 1.5 L 8 5 L 0 8.5 z");
  arrowPath.setAttribute("fill", "#4c8dff");
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const dx = Math.max(40, Math.abs(endX - startX) * 0.5);
  const cp1X = startX + dx;
  const cp1Y = startY;
  const cp2X = endX - dx;
  const cp2Y = endY;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    `M ${startX} ${startY} C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${endX} ${endY}`,
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#4c8dff");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("marker-end", "url(#prototype-arrow)");
  path.style.pointerEvents = "auto";
  path.style.cursor = "pointer";

  path.addEventListener("click", () => {
    bridge?.send("ombrique:selectNode", {
      file: fromNode.file,
      path: fromNode.path,
    });
  });

  svg.appendChild(path);
  overlay.appendChild(svg);

  const midX = 0.125 * startX + 0.375 * cp1X + 0.375 * cp2X + 0.125 * endX;
  const midY = 0.125 * startY + 0.375 * cp1Y + 0.375 * cp2Y + 0.125 * endY;

  const triggerType = fromNode.element.getAttribute("data-prototype-hover")
    ? "Hover"
    : "Click";

  const badge = document.createElement("div");
  badge.className = "prototype-badge";
  badge.style.position = "absolute";
  badge.style.left = `${midX}px`;
  badge.style.top = `${midY}px`;
  badge.style.transform = "translate(-50%, -50%)";
  badge.style.background = "#1e293b";
  badge.style.border = "1px solid #4c8dff";
  badge.style.color = "#ffffff";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "500";
  badge.style.padding = "2px 8px";
  badge.style.borderRadius = "9999px";
  badge.style.display = "flex";
  badge.style.alignItems = "center";
  badge.style.gap = "4px";
  badge.style.cursor = "pointer";
  badge.style.pointerEvents = "auto";
  badge.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
  badge.style.userSelect = "none";
  badge.title = "点击定位交互原型图层";

  badge.innerHTML = `<span>⚡</span><span>On ${triggerType} → ${targetPage.name}</span>`;
  badge.addEventListener("click", () => {
    bridge?.send("ombrique:selectNode", {
      file: fromNode.file,
      path: fromNode.path,
    });
  });
  overlay.appendChild(badge);
}

function updatePrototypeBar(): void {
  if (!prototypeMode) {
    prototypeBarElement?.remove();
    prototypeBarElement = null;
    return;
  }
  if (!prototypeBarElement) {
    prototypeBarElement = document.createElement("div");
    prototypeBarElement.id = "prototype-control-bar";
    prototypeBarElement.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(8px);border-radius:9999px;box-shadow:0 8px 24px rgba(0,0,0,0.35);padding:4px 12px;display:flex;align-items:center;gap:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;color:#f8fafc;z-index:99999;user-select:none;pointer-events:auto;";
    document.body.appendChild(prototypeBarElement);
  }

  const currentPage = manifest?.pages.find((p) => p.file === currentFile);
  const pageName =
    currentPage?.name ?? currentFile?.replace(/\.tsx?$/, "") ?? "Page";
  const canBack = prototypeHistory.length > 0;

  prototypeBarElement.innerHTML = `
    <button id="proto-back-btn" type="button" style="border:none;background:${canBack ? "rgba(255,255,255,0.12)" : "transparent"};color:${canBack ? "#ffffff" : "rgba(255,255,255,0.35)"};border-radius:9999px;height:24px;padding:0 8px;display:flex;align-items:center;gap:4px;cursor:${canBack ? "pointer" : "default"};font-size:11px;" ${canBack ? "" : "disabled"}>
      <span>←</span><span>返回</span>
    </button>
    <div style="height:12px;width:1px;background:rgba(255,255,255,0.2);"></div>
    <span style="font-weight:500;padding:0 4px;color:#93c5fd;">${pageName}</span>
    <div style="height:12px;width:1px;background:rgba(255,255,255,0.2);"></div>
    <button id="proto-reset-btn" type="button" title="重置到首个画板" style="border:none;background:transparent;color:rgba(255,255,255,0.7);border-radius:9999px;height:24px;padding:0 6px;display:flex;align-items:center;cursor:pointer;font-size:12px;">
      <span>↺</span>
    </button>
    <button id="proto-exit-btn" type="button" title="退出原型预览 (Esc)" style="border:none;background:rgba(239,68,68,0.25);color:#fca5a5;border-radius:9999px;height:24px;padding:0 10px;display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;font-weight:500;">
      <span>✕ 退出</span>
    </button>
    <span style="font-size:10px;color:rgba(255,255,255,0.4);margin-left:4px;">(Esc)</span>
  `;

  const backBtn =
    prototypeBarElement.querySelector<HTMLButtonElement>("#proto-back-btn");
  backBtn?.addEventListener("click", () => {
    if (prototypeHistory.length > 0) {
      const prev = prototypeHistory.pop();
      if (prev) {
        void navigatePrototypePage(prev, "slide-right", 250, false);
      }
    }
  });

  const resetBtn =
    prototypeBarElement.querySelector<HTMLButtonElement>("#proto-reset-btn");
  resetBtn?.addEventListener("click", () => {
    if (manifest?.pages[0]) {
      prototypeHistory.length = 0;
      void navigatePrototypePage(manifest.pages[0].id, "dissolve", 200, false);
    }
  });

  const exitBtn =
    prototypeBarElement.querySelector<HTMLButtonElement>("#proto-exit-btn");
  exitBtn?.addEventListener("click", () => {
    setPrototypeMode(false);
  });
}

function setPrototypeMode(active: boolean): void {
  if (prototypeMode === active) return;
  prototypeMode = active;
  if (prototypeMode) {
    selectSingle(null);
    const switcherEl = document.querySelector(
      ".floating-tool-switcher",
    ) as HTMLElement | null;
    if (switcherEl) switcherEl.style.display = "none";
    updatePrototypeBar();
  } else {
    prototypeHistory.length = 0;
    if (lastHoveredPrototypeEl) {
      const orig = originalHoverStyles.get(lastHoveredPrototypeEl);
      if (orig !== undefined) lastHoveredPrototypeEl.style.cssText = orig;
      lastHoveredPrototypeEl = null;
    }
    const switcherEl = document.querySelector(
      ".floating-tool-switcher",
    ) as HTMLElement | null;
    if (switcherEl) switcherEl.style.display = "";
    updatePrototypeBar();
    bridge?.send("ombrique:prototypeModeChanged", false);
  }
  drawOverlay();
}

async function navigatePrototypePage(
  targetPageId: string,
  transitionType = "instant",
  duration = 300,
  pushHistory = true,
): Promise<void> {
  if (!manifest) return;
  const targetPage =
    manifest.pages.find(
      (p) =>
        p.id === targetPageId ||
        p.file === targetPageId ||
        p.name === targetPageId,
    ) ??
    manifest.pages.find(
      (p) => p.file.includes(targetPageId) || targetPageId.includes(p.id),
    );
  if (!targetPage) return;
  if (targetPage.file === currentFile) return;

  if (pushHistory && currentFile) {
    prototypeHistory.push(currentFile);
  }

  if (transitionType === "instant" || duration <= 0) {
    await mountPage(targetPage.file);
    bridge?.send("ombrique:pageChanged", targetPage.id);
    updatePrototypeBar();
    drawOverlay();
    return;
  }

  const outgoingBoard = currentFile ? boards.get(currentFile) : null;
  const newFile = targetPage.file;
  currentFile = newFile;

  const incomingElement = document.createElement("section");
  incomingElement.className = "board";
  incomingElement.dataset.file = newFile;
  incomingElement.setAttribute("drawable", "");
  incomingElement.style.position = "absolute";
  incomingElement.style.left = "0px";
  incomingElement.style.top = "0px";

  const incomingRoot = createRoot(incomingElement);
  boards.set(newFile, { element: incomingElement, reactRoot: incomingRoot });
  stage.appendChild(incomingElement);

  let component: ComponentType | null = null;
  try {
    component = await importPage(newFile, Date.now());
  } catch (e) {
    console.warn("[canvas] page unavailable during transition:", newFile, e);
  }
  if (component) {
    incomingRoot.render(createElement(component));
    const { promise, resolve } = Promise.withResolvers<void>();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    await promise;
  }
  registerSubtree(incomingElement, incomingElement, newFile);

  const outgoingEl = outgoingBoard?.element;
  const incomingEl = incomingElement;

  if (transitionType === "dissolve") {
    incomingEl.style.opacity = "0";
    incomingEl.style.transition = `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    if (outgoingEl) {
      outgoingEl.style.transition = `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    }
    requestAnimationFrame(() => {
      incomingEl.style.opacity = "1";
      if (outgoingEl) outgoingEl.style.opacity = "0";
    });
  } else if (transitionType === "slide-left") {
    incomingEl.style.transform = "translate(100%, 0px)";
    incomingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    if (outgoingEl) {
      outgoingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    }
    requestAnimationFrame(() => {
      incomingEl.style.transform = "translate(0px, 0px)";
      if (outgoingEl) outgoingEl.style.transform = "translate(-100%, 0px)";
    });
  } else if (transitionType === "slide-right") {
    incomingEl.style.transform = "translate(-100%, 0px)";
    incomingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    if (outgoingEl) {
      outgoingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    }
    requestAnimationFrame(() => {
      incomingEl.style.transform = "translate(0px, 0px)";
      if (outgoingEl) outgoingEl.style.transform = "translate(100%, 0px)";
    });
  } else if (transitionType === "slide-up") {
    incomingEl.style.transform = "translate(0px, 100%)";
    incomingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    if (outgoingEl) {
      outgoingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    }
    requestAnimationFrame(() => {
      incomingEl.style.transform = "translate(0px, 0px)";
      if (outgoingEl) outgoingEl.style.transform = "translate(0px, -100%)";
    });
  } else if (transitionType === "slide-down") {
    incomingEl.style.transform = "translate(0px, -100%)";
    incomingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    if (outgoingEl) {
      outgoingEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    }
    requestAnimationFrame(() => {
      incomingEl.style.transform = "translate(0px, 0px)";
      if (outgoingEl) outgoingEl.style.transform = "translate(0px, 100%)";
    });
  }

  setTimeout(() => {
    if (outgoingBoard) {
      outgoingBoard.reactRoot.unmount();
      outgoingBoard.element.remove();
      boards.delete(outgoingBoard.element.dataset.file ?? "");
    }
    incomingEl.style.transition = "";
    incomingEl.style.transform = "translate(0px, 0px)";
    incomingEl.style.opacity = "";
    compositor?.setBoards([
      {
        el: incomingEl,
        worldX: 0,
        worldY: 0,
        worldW: incomingEl.offsetWidth,
        worldH: incomingEl.offsetHeight,
      },
    ]);
    drawOverlay();
  }, duration + 30);

  bridge?.send("ombrique:pageChanged", targetPage.id);
  updatePrototypeBar();
}

function drawOverlay() {
  if (!overlay) return;
  overlay.replaceChildren();
  if (editingText) return;
  revalidateSelection();

  if (showHotspots || prototypeHotspotsFlashing) {
    drawHotspotOverlays();
  }

  if (prototypeMode) {
    return;
  }
  for (const node of multiSelection) {
    const rect = syncNodeRect(node);
    const box = document.createElement("div");
    box.className = "selection-box";
    box.style.left = `${(rect.x - camera.x) * camera.z}px`;
    box.style.top = `${(rect.y - camera.y) * camera.z}px`;
    box.style.width = `${rect.width * camera.z}px`;
    box.style.height = `${rect.height * camera.z}px`;
    overlay.appendChild(box);
  }
  if (selection && multiSelection.length <= 1 && isEditableNode(selection)) {
    const rect = syncNodeRect(selection);
    if (isPathNode(selection)) {
      const d = getPathData(selection);
      if (d) {
        try {
          const anchors = getAnchorPoints(d);
          const handles = getControlHandles(d);
          const svgOverlay = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          svgOverlay.style.position = "absolute";
          svgOverlay.style.inset = "0";
          svgOverlay.style.width = "100%";
          svgOverlay.style.height = "100%";
          svgOverlay.style.pointerEvents = "none";
          svgOverlay.style.overflow = "visible";

          for (const h of handles) {
            const anchor = anchors[h.anchorIndex];
            if (!anchor) continue;
            const ax = (rect.x + anchor.x - camera.x) * camera.z;
            const ay = (rect.y + anchor.y - camera.y) * camera.z;
            const hx = (rect.x + h.point.x - camera.x) * camera.z;
            const hy = (rect.y + h.point.y - camera.y) * camera.z;

            const line = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "line",
            );
            line.setAttribute("x1", String(ax));
            line.setAttribute("y1", String(ay));
            line.setAttribute("x2", String(hx));
            line.setAttribute("y2", String(hy));
            line.setAttribute("stroke", "#4c8dff");
            line.setAttribute("stroke-width", "1");
            svgOverlay.appendChild(line);

            const circle = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "circle",
            );
            circle.setAttribute("cx", String(hx));
            circle.setAttribute("cy", String(hy));
            circle.setAttribute("r", "3.5");
            circle.setAttribute("fill", "#ffffff");
            circle.setAttribute("stroke", "#4c8dff");
            circle.setAttribute("stroke-width", "1.5");
            svgOverlay.appendChild(circle);
          }
          overlay.appendChild(svgOverlay);

          for (let i = 0; i < anchors.length; i++) {
            const a = anchors[i];
            if (!a) continue;
            const ax = (rect.x + a.x - camera.x) * camera.z;
            const ay = (rect.y + a.y - camera.y) * camera.z;
            const square = document.createElement("div");
            square.style.position = "absolute";
            square.style.width = "8px";
            square.style.height = "8px";
            square.style.left = `${ax - 4}px`;
            square.style.top = `${ay - 4}px`;
            square.style.backgroundColor =
              drag.mode === "pathAnchor" && drag.pathAnchorIndex === i
                ? "#4c8dff"
                : "#ffffff";
            square.style.border = "1.5px solid #4c8dff";
            square.style.borderRadius = "1px";
            square.style.pointerEvents = "none";
            overlay.appendChild(square);
          }
        } catch {}
      }
    } else {
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
  }
  if (toolMode === "pen" && penDraft && penDraft.points.length > 0) {
    const board = currentFile ? boards.get(currentFile) : undefined;
    if (board) {
      const origin = boardWorldOrigin(board.element);
      const pts = penDraft.points;
      const svgOverlay = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      svgOverlay.style.position = "absolute";
      svgOverlay.style.inset = "0";
      svgOverlay.style.width = "100%";
      svgOverlay.style.height = "100%";
      svgOverlay.style.pointerEvents = "none";
      svgOverlay.style.overflow = "visible";

      const pathEl = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      const screenPts = pts.map((pt) => ({
        anchor: {
          x: (origin.x + pt.anchor.x - camera.x) * camera.z,
          y: (origin.y + pt.anchor.y - camera.y) * camera.z,
        },
        handleIn: pt.handleIn
          ? {
              x: (origin.x + pt.handleIn.x - camera.x) * camera.z,
              y: (origin.y + pt.handleIn.y - camera.y) * camera.z,
            }
          : null,
        handleOut: pt.handleOut
          ? {
              x: (origin.x + pt.handleOut.x - camera.x) * camera.z,
              y: (origin.y + pt.handleOut.y - camera.y) * camera.z,
            }
          : null,
      }));

      let draftD = buildPathD(screenPts, false);
      if (penDraft.currentPoint && !penDraft.draggingHandle) {
        const curX = (origin.x + penDraft.currentPoint.x - camera.x) * camera.z;
        const curY = (origin.y + penDraft.currentPoint.y - camera.y) * camera.z;
        const last = screenPts[screenPts.length - 1];
        if (last?.handleOut) {
          draftD += ` C ${last.handleOut.x} ${last.handleOut.y} ${curX} ${curY} ${curX} ${curY}`;
        } else {
          draftD += ` L ${curX} ${curY}`;
        }
      }

      pathEl.setAttribute("d", draftD);
      pathEl.setAttribute("fill", "none");
      pathEl.setAttribute("stroke", "#4c8dff");
      pathEl.setAttribute("stroke-width", "2");
      pathEl.setAttribute("stroke-dasharray", "4 4");
      svgOverlay.appendChild(pathEl);

      for (const pt of screenPts) {
        if (pt.handleIn) {
          const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line",
          );
          line.setAttribute("x1", String(pt.anchor.x));
          line.setAttribute("y1", String(pt.anchor.y));
          line.setAttribute("x2", String(pt.handleIn.x));
          line.setAttribute("y2", String(pt.handleIn.y));
          line.setAttribute("stroke", "#4c8dff");
          line.setAttribute("stroke-width", "1");
          svgOverlay.appendChild(line);

          const circle = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle",
          );
          circle.setAttribute("cx", String(pt.handleIn.x));
          circle.setAttribute("cy", String(pt.handleIn.y));
          circle.setAttribute("r", "3.5");
          circle.setAttribute("fill", "#ffffff");
          circle.setAttribute("stroke", "#4c8dff");
          circle.setAttribute("stroke-width", "1.5");
          svgOverlay.appendChild(circle);
        }
        if (pt.handleOut) {
          const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line",
          );
          line.setAttribute("x1", String(pt.anchor.x));
          line.setAttribute("y1", String(pt.anchor.y));
          line.setAttribute("x2", String(pt.handleOut.x));
          line.setAttribute("y2", String(pt.handleOut.y));
          line.setAttribute("stroke", "#4c8dff");
          line.setAttribute("stroke-width", "1");
          svgOverlay.appendChild(line);

          const circle = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle",
          );
          circle.setAttribute("cx", String(pt.handleOut.x));
          circle.setAttribute("cy", String(pt.handleOut.y));
          circle.setAttribute("r", "3.5");
          circle.setAttribute("fill", "#ffffff");
          circle.setAttribute("stroke", "#4c8dff");
          circle.setAttribute("stroke-width", "1.5");
          svgOverlay.appendChild(circle);
        }
      }
      overlay.appendChild(svgOverlay);

      for (const pt of screenPts) {
        const square = document.createElement("div");
        square.style.position = "absolute";
        square.style.width = "8px";
        square.style.height = "8px";
        square.style.left = `${pt.anchor.x - 4}px`;
        square.style.top = `${pt.anchor.y - 4}px`;
        square.style.backgroundColor = "#ffffff";
        square.style.border = "1.5px solid #4c8dff";
        square.style.borderRadius = "1px";
        square.style.pointerEvents = "none";
        overlay.appendChild(square);
      }
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
  if (createPreview) {
    const band = document.createElement("div");
    band.className = "marquee-band";
    band.style.position = "absolute";
    band.style.border = "1px solid #4c8dff";
    band.style.backgroundColor = "rgba(76, 141, 255, 0.12)";
    band.style.left = `${(Math.min(createPreview.x0, createPreview.x1) - camera.x) * camera.z}px`;
    band.style.top = `${(Math.min(createPreview.y0, createPreview.y1) - camera.y) * camera.z}px`;
    band.style.width = `${Math.abs(createPreview.x1 - createPreview.x0) * camera.z}px`;
    band.style.height = `${Math.abs(createPreview.y1 - createPreview.y0) * camera.z}px`;
    overlay.appendChild(band);
  }
  if (activeSmartGuides) {
    renderSmartGuidesOverlay(
      overlay,
      camera,
      activeSmartGuides.lines,
      activeSmartGuides.spacing,
    );
  }
  if (
    altPressed &&
    selection &&
    hoveredNode?.element.isConnected &&
    hoveredNode.element !== selection.element
  ) {
    renderAltMeasurementsOverlay(
      overlay,
      camera,
      syncNodeRect(selection),
      syncNodeRect(hoveredNode),
    );
  }
  if (
    selection &&
    multiSelection.length <= 1 &&
    isEditableNode(selection) &&
    !isPathNode(selection)
  ) {
    const info = getAutoLayoutInfo(selection.element);
    if (info) {
      currentLayoutHandles = computeLayoutHandles(
        info,
        syncNodeRect(selection),
        camera,
        (el) => worldRectOf(el),
      );
      renderLayoutHandlesOverlay(
        overlay,
        currentLayoutHandles,
        activeLayoutHandle,
      );
    } else {
      currentLayoutHandles = [];
    }
  } else {
    currentLayoutHandles = [];
  }
  renderReferenceLinesOverlay(
    overlay,
    camera,
    referenceLines,
    activeReferenceLine,
  );
  drawCommentPins();
  renderRulersOverlay(overlay, camera, lastMouseClient);
  if (!prototypeMode && selection && isEditableNode(selection)) {
    const targetPageId =
      selection.element.getAttribute("data-prototype-navigate") ||
      (flagsOf(selection).attrs.includes("onClickNavigate")
        ? selection.element.getAttribute("data-prototype-navigate")
        : null);

    if (targetPageId) {
      drawPrototypeConnectionLine(selection, targetPageId);
    }
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
  const wx = clientX / camera.z + camera.x;
  const wy = clientY / camera.z + camera.y;
  for (const [element, info] of [...nodeIndex].reverse()) {
    const board = element.closest<HTMLElement>(".board");
    if (!board || !element.isConnected) continue;
    if (!isSelectableElement(element, board)) continue;
    const rect = worldRectOf(element);
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      !(
        wx >= rect.x &&
        wx <= rect.x + rect.width &&
        wy >= rect.y &&
        wy <= rect.y + rect.height
      )
    ) {
      continue;
    }
    return {
      file: info.file,
      path: info.path,
      tag: element.tagName.toLowerCase(),
      name: element.getAttribute("data-name"),
      rect,
      element,
    };
  }
  return null;
}

function handleAtPoint(clientX: number, clientY: number): HandleId | null {
  if (!selection || editingText) return null;
  revalidateSelection();
  if (!selection) return null;
  const rect = syncNodeRect(selection);
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
    if (!element.isConnected) continue;
    if (info.file !== file) continue;
    if (info.path.join("/") !== path.join("/")) continue;
    return {
      file: info.file,
      path: info.path,
      tag: element.tagName.toLowerCase(),
      name: element.getAttribute("data-name"),
      rect: worldRectOf(element),
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
  const boardOrigin = boardWorldOrigin(node.element);
  const orig =
    drag.nodeOrigins?.get(nodeKeyOf(node.file, node.path)) ??
    drag.originRect ??
    syncNodeRect(node);
  const x = Math.round(orig.x + dx - boardOrigin.x);
  const y = Math.round(orig.y + dy - boardOrigin.y);
  const commands: unknown[] = [];
  if (usesAttrsX) {
    commands.push({
      kind: "setAttrs",
      target,
      attrs: { x, y },
    });
  } else {
    commands.push({
      kind: "setStyle",
      target,
      declarations: [
        ["left", x],
        ["top", y],
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
  const boardOrigin = boardWorldOrigin(node.element);
  const commands: unknown[] = [];
  if (usesAttrsX) {
    const patch: Record<string, number> = {};
    if (movesX) patch.x = Math.round(x - boardOrigin.x);
    if (movesY) patch.y = Math.round(y - boardOrigin.y);
    if (attrsW) {
      patch.width = Math.round(width);
      patch.height = Math.round(height);
    }
    if (Object.keys(patch).length > 0) {
      commands.push({ kind: "setAttrs", target, attrs: patch });
    }
  } else {
    const declarations: Array<[string, number]> = [];
    if (movesX) declarations.push(["left", Math.round(x - boardOrigin.x)]);
    if (movesY) declarations.push(["top", Math.round(y - boardOrigin.y)]);
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
    const boardOrigin = boardWorldOrigin(node.element);
    const orig =
      drag.nodeOrigins?.get(nodeKeyOf(node.file, node.path)) ??
      syncNodeRect(node);
    const x = Math.round(orig.x + dx - boardOrigin.x);
    const y = Math.round(orig.y + dy - boardOrigin.y);
    if (flags.attrs.includes("x") && flags.attrs.includes("y")) {
      commands.push({
        kind: "setAttrs",
        target,
        attrs: { x, y },
      });
    } else {
      commands.push({
        kind: "setStyle",
        target,
        declarations: [
          ["left", x],
          ["top", y],
        ],
      });
    }
  }
  if (commands.length > 0) bridge?.send("ombrique:canvasEdit", { commands });
}

function previewMove(dx: number, dy: number): void {
  if (!selection || !drag.originRect) return;
  const candidateRect = {
    x: drag.originRect.x + dx,
    y: drag.originRect.y + dy,
    width: drag.originRect.width,
    height: drag.originRect.height,
  };
  const snap = drawSmartGuides(candidateRect);
  const snappedDx = dx + (snap?.dx ?? 0);
  const snappedDy = dy + (snap?.dy ?? 0);
  drag.snappedDx = snappedDx;
  drag.snappedDy = snappedDy;
  activeSmartGuides = snap
    ? { lines: snap.lines, spacing: snap.spacing }
    : null;

  const nodes = multiSelection.length > 1 ? multiSelection : [selection];
  for (const node of nodes) {
    const element = node.element as HTMLElement;
    const origin = boardWorldOrigin(node.element);
    const orig =
      drag.nodeOrigins?.get(nodeKeyOf(node.file, node.path)) ?? drag.originRect;
    element.style.position = "absolute";
    element.style.left = `${orig.x + snappedDx - origin.x}px`;
    element.style.top = `${orig.y + snappedDy - origin.y}px`;
    syncNodeRect(node);
  }
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

  const xFeatures: GuideFeature[] = handle.includes("w")
    ? ["start"]
    : handle.includes("e")
      ? ["end"]
      : [];
  const yFeatures: GuideFeature[] = handle.includes("n")
    ? ["start"]
    : handle.includes("s")
      ? ["end"]
      : [];

  const candidateRect = {
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
  const snap = drawSmartGuides(candidateRect, undefined, {
    xFeatures,
    yFeatures,
  });
  const snappedDx = handle.includes("w")
    ? dx + (snap?.dx ?? 0)
    : handle.includes("e")
      ? dx + (snap?.dx ?? 0)
      : dx;
  const snappedDy = handle.includes("n")
    ? dy + (snap?.dy ?? 0)
    : handle.includes("s")
      ? dy + (snap?.dy ?? 0)
      : dy;

  drag.snappedDx = snappedDx;
  drag.snappedDy = snappedDy;
  activeSmartGuides = snap
    ? { lines: snap.lines, spacing: snap.spacing }
    : null;

  x = originRect.x;
  y = originRect.y;
  width = originRect.width;
  height = originRect.height;
  if (handle.includes("w")) {
    x = originRect.x + snappedDx;
    width = originRect.width - snappedDx;
  }
  if (handle.includes("e")) width = originRect.width + snappedDx;
  if (handle.includes("n")) {
    y = originRect.y + snappedDy;
    height = originRect.height - snappedDy;
  }
  if (handle.includes("s")) height = originRect.height + snappedDy;
  width = Math.max(1, width);
  height = Math.max(1, height);

  const element = selection.element as HTMLElement;
  const origin = boardWorldOrigin(selection.element);
  element.style.position = "absolute";
  element.style.left = `${x - origin.x}px`;
  element.style.top = `${y - origin.y}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  syncNodeRect(selection);
  drawOverlay();
}

function nudge(dx: number, dy: number): void {
  if (multiSelection.length === 0) return;
  for (const node of multiSelection) {
    const element = node.element as HTMLElement;
    const origin = boardWorldOrigin(node.element);
    const rect = syncNodeRect(node);
    element.style.position = "absolute";
    element.style.left = `${rect.x + dx - origin.x}px`;
    element.style.top = `${rect.y + dy - origin.y}px`;
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
  element.style.userSelect = "text";
  element.style.setProperty("-webkit-user-select", "text");
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
  element.style.userSelect = "";
  element.style.removeProperty("-webkit-user-select");
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
  editingText.style.userSelect = "";
  editingText.style.removeProperty("-webkit-user-select");
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
        onSelectTool: activateTool,
      }),
    );
  };
  activateTool = (tool: CanvasTool) => {
    toolMode = tool;
    bridge?.send("ombrique:toolChanged", { tool });
    renderToolSwitcher();
  };
  renderToolSwitcher();

  window.addEventListener("keydown", (event) => {
    if (editingText) return;
    if (toolMode === "pen") {
      if (event.key === "Enter") {
        event.preventDefault();
        finishPenPath(false);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        penDraft = null;
        activateTool("select");
        drawOverlay();
        return;
      }
    }
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) {
      const shortcuts: Record<string, CanvasTool> = {
        v: "select",
        h: "hand",
        f: "frame",
        r: "rect",
        o: "ellipse",
        s: "star",
        p: "pen",
        t: "text",
        c: "comment",
      };
      const tool = shortcuts[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        activateTool(tool);
        return;
      }
    }
    if (event.key === "Escape") {
      if (prototypeMode) {
        setPrototypeMode(false);
        return;
      }
      createPreview = null;
      penDraft = null;
      activateTool("select");
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
    if (event.key === "Alt") {
      altPressed = false;
      hoveredNode = null;
      drawOverlay();
    }
  });
  window.addEventListener("blur", () => {
    altPressed = false;
    spacePressed = false;
    hoveredNode = null;
    drawOverlay();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Alt" && !editingText) {
      altPressed = true;
      if (lastMouseClient && selection) {
        hoveredNode = hitTest(lastMouseClient.x, lastMouseClient.y);
      }
      drawOverlay();
    }
  });

  host.addEventListener("pointerdown", (event) => {
    if (editingText) return;
    try {
      host.setPointerCapture(event.pointerId);
    } catch {}
    if (prototypeMode) {
      const interactive = (event.target as HTMLElement)?.closest<HTMLElement>(
        "[data-prototype-navigate]",
      );
      if (interactive) {
        const targetPageId = interactive.getAttribute(
          "data-prototype-navigate",
        );
        if (targetPageId) {
          const transType =
            interactive.getAttribute("data-prototype-transition") || "instant";
          const transDur = Number(
            interactive.getAttribute("data-prototype-duration") || 300,
          );
          void navigatePrototypePage(targetPageId, transType, transDur);
          return;
        }
      } else {
        triggerHotspotFlash();
      }
      return;
    }
    const isModifier = event.shiftKey || event.ctrlKey || event.metaKey;
    if (
      toolMode === "select" &&
      !isModifier &&
      (event.clientY <= 20 || event.clientX <= 20)
    ) {
      if (event.clientY <= 20) {
        const ref: ReferenceLine = {
          axis: "y",
          position: event.clientY / camera.z + camera.y,
        };
        referenceLines.push(ref);
        drag.mode = "reference";
        activeReferenceLine = ref;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved = false;
        drawOverlay();
        return;
      }
      if (event.clientX <= 20) {
        const ref: ReferenceLine = {
          axis: "x",
          position: event.clientX / camera.z + camera.x,
        };
        referenceLines.push(ref);
        drag.mode = "reference";
        activeReferenceLine = ref;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved = false;
        drawOverlay();
        return;
      }
    }
    if (toolMode === "select" && !isModifier) {
      const refHit = referenceLineAtPoint(
        referenceLines,
        camera,
        event.clientX,
        event.clientY,
      );
      if (refHit) {
        drag.mode = "reference";
        activeReferenceLine = refHit;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved = false;
        drawOverlay();
        return;
      }
    }
    if (
      toolMode === "select" &&
      !isModifier &&
      currentLayoutHandles.length > 0
    ) {
      const lh = layoutHandleAtPoint(
        currentLayoutHandles,
        event.clientX,
        event.clientY,
      );
      if (lh && selection) {
        if (lh.type === "gap") {
          drag.mode = "gap";
          drag.originValue = lh.value;
          drag.activeLayoutHandle = lh;
          drag.x = event.clientX;
          drag.y = event.clientY;
          drag.moved = false;
          drawOverlay();
          return;
        }
        if (lh.type === "padding") {
          drag.mode = "padding";
          drag.originValue = lh.value;
          drag.activeLayoutHandle = lh;
          drag.x = event.clientX;
          drag.y = event.clientY;
          drag.moved = false;
          drawOverlay();
          return;
        }
      }
    }
    if (toolMode === "comment") {
      const hit = hitTest(event.clientX, event.clientY);
      const wx = Math.round(event.clientX / camera.z + camera.x);
      const wy = Math.round(event.clientY / camera.z + camera.y);
      const currentBoard = currentFile ? boards.get(currentFile) : undefined;
      const boardOrigin = currentBoard
        ? boardWorldOrigin(currentBoard.element)
        : { x: 0, y: 0 };
      const page = manifest?.pages.find((p) => p.file === currentFile);
      const pageId = page?.id ?? currentFile ?? "page";
      const anchor = hit
        ? {
            type: "node" as const,
            nodeRef: { file: hit.file, start: 0, end: 0, path: hit.path },
            x: Math.round(wx - boardOrigin.x),
            y: Math.round(wy - boardOrigin.y),
            pageId,
          }
        : {
            type: "canvas" as const,
            pageId,
            x: Math.round(wx - boardOrigin.x),
            y: Math.round(wy - boardOrigin.y),
          };
      bridge?.send("ombrique:commentPlaced", anchor);
      activateTool("select");
      return;
    }
    if (event.button === 1 || spacePressed || toolMode === "hand") {
      drag.mode = "pan";
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved = false;
      return;
    }
    if (toolMode === "pen") {
      const board = currentFile ? boards.get(currentFile) : undefined;
      if (!board) return;
      const origin = boardWorldOrigin(board.element);
      const bx = event.clientX / camera.z + camera.x - origin.x;
      const by = event.clientY / camera.z + camera.y - origin.y;

      if (!penDraft) {
        penDraft = {
          points: [
            { anchor: { x: bx, y: by }, handleIn: null, handleOut: null },
          ],
          currentPoint: { x: bx, y: by },
          draggingHandle: true,
        };
        drag.mode = "pen";
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved = false;
        drawOverlay();
        return;
      }

      const firstPt = penDraft.points[0];
      if (firstPt) {
        const screenDist = Math.hypot(
          (origin.x + firstPt.anchor.x - camera.x) * camera.z - event.clientX,
          (origin.y + firstPt.anchor.y - camera.y) * camera.z - event.clientY,
        );
        if (screenDist <= 10 && penDraft.points.length >= 2) {
          finishPenPath(true);
          return;
        }
      }

      penDraft.points.push({
        anchor: { x: bx, y: by },
        handleIn: null,
        handleOut: null,
      });
      penDraft.draggingHandle = true;
      drag.mode = "pen";
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved = false;
      drawOverlay();
      return;
    }
    if (isCreateTool(toolMode)) {
      const board = currentFile ? boards.get(currentFile) : undefined;
      if (!board) return;
      const wx = event.clientX / camera.z + camera.x;
      const wy = event.clientY / camera.z + camera.y;
      drag.mode = "create";
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved = false;
      createPreview = { x0: wx, y0: wy, x1: wx, y1: wy };
      selectSingle(null);
      return;
    }
    if (selection && isPathNode(selection) && !isModifier) {
      const pathHandle = findPathHandleAtPoint(event.clientX, event.clientY);
      if (pathHandle) {
        const d = getPathData(selection);
        if (d) {
          beginNodeInteraction();
          drag.mode = "pathHandle";
          drag.pathAnchorIndex = pathHandle.anchorIndex;
          drag.pathHandleIndex = pathHandle.handleIndex;
          drag.originalD = d;
          drag.currentD = d;
          drag.originPoint = pathHandle.point;
          drag.x = event.clientX;
          drag.y = event.clientY;
          drag.moved = false;
          return;
        }
      }

      const pathAnchor = findPathAnchorAtPoint(event.clientX, event.clientY);
      if (pathAnchor) {
        const d = getPathData(selection);
        if (d) {
          beginNodeInteraction();
          drag.mode = "pathAnchor";
          drag.pathAnchorIndex = pathAnchor.index;
          drag.originalD = d;
          drag.currentD = d;
          drag.originPoint = pathAnchor.point;
          drag.x = event.clientX;
          drag.y = event.clientY;
          drag.moved = false;
          return;
        }
      }

      if (event.altKey) {
        const d = getPathData(selection);
        if (d) {
          const rect = syncNodeRect(selection);
          const localX = event.clientX / camera.z + camera.x - rect.x;
          const localY = event.clientY / camera.z + camera.y - rect.y;
          const newD = addPointToPath(
            d,
            Math.round(localX),
            Math.round(localY),
          );
          if (newD !== d) {
            applyPathD(selection, newD);
            bridge?.send("ombrique:canvasEdit", {
              commands: [
                {
                  kind: "setAttrs",
                  target: {
                    file: selection.file,
                    start: 0,
                    end: 0,
                    path: selection.path,
                  },
                  attrs: { d: newD },
                },
              ],
            });
            drawOverlay();
            return;
          }
        }
      }
    }
    const handle = handleAtPoint(event.clientX, event.clientY);
    if (
      handle &&
      selection &&
      isEditableNode(selection) &&
      multiSelection.length <= 1
    ) {
      beginNodeInteraction();
      drag.mode = "scale";
      drag.handle = handle;
      drag.originRect = { ...syncNodeRect(selection) };
      beginDragSnapshot([selection]);
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
        beginNodeInteraction();
        drag.mode = "move";
        drag.originRect = selection ? { ...syncNodeRect(selection) } : null;
        drag.nodeOrigins = new Map(
          multiSelection.map((n) => {
            const rect = syncNodeRect(n);
            return [nodeKeyOf(n.file, n.path), { x: rect.x, y: rect.y }];
          }),
        );
        beginDragSnapshot(multiSelection);
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved = false;
        return;
      }
    }
    if (hit) {
      selectSingle(hit);
      if (isEditableNode(hit)) {
        beginNodeInteraction();
        drag.mode = "move";
        drag.originRect = { ...syncNodeRect(hit) };
        drag.nodeOrigins = new Map([
          [nodeKeyOf(hit.file, hit.path), drag.originRect],
        ]);
        beginDragSnapshot([hit]);
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
    pendingPointerMove = {
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: event.altKey,
      target: event.target,
    };
    if (pointerMoveRaf) return;
    pointerMoveRaf = requestAnimationFrame(() => {
      pointerMoveRaf = 0;
      const move = pendingPointerMove;
      pendingPointerMove = null;
      if (move) handlePointerMove(move);
    });
  });

  function handlePointerMove(event: PointerMoveSnapshot): void {
    if (drag.mode === "pen" && penDraft && penDraft.draggingHandle) {
      const board = currentFile ? boards.get(currentFile) : undefined;
      if (board) {
        const origin = boardWorldOrigin(board.element);
        const bx = event.clientX / camera.z + camera.x - origin.x;
        const by = event.clientY / camera.z + camera.y - origin.y;
        const lastPt = penDraft.points[penDraft.points.length - 1];
        if (lastPt) {
          const dx = bx - lastPt.anchor.x;
          const dy = by - lastPt.anchor.y;
          if (Math.hypot(dx, dy) > 2) {
            lastPt.handleOut = {
              x: lastPt.anchor.x + dx,
              y: lastPt.anchor.y + dy,
            };
            lastPt.handleIn = {
              x: lastPt.anchor.x - dx,
              y: lastPt.anchor.y - dy,
            };
          }
          drawOverlay();
          return;
        }
      }
    }
    if (toolMode === "pen" && penDraft && drag.mode === "none") {
      const board = currentFile ? boards.get(currentFile) : undefined;
      if (board) {
        const origin = boardWorldOrigin(board.element);
        penDraft.currentPoint = {
          x: event.clientX / camera.z + camera.x - origin.x,
          y: event.clientY / camera.z + camera.y - origin.y,
        };
        drawOverlay();
      }
    }
    if (
      drag.mode === "pathAnchor" &&
      selection &&
      drag.originalD &&
      drag.pathAnchorIndex !== undefined &&
      drag.originPoint
    ) {
      const dlx = (event.clientX - drag.x) / camera.z;
      const dly = (event.clientY - drag.y) / camera.z;
      const newX = Math.round(drag.originPoint.x + dlx);
      const newY = Math.round(drag.originPoint.y + dly);
      try {
        const newD = moveAnchorPoint(
          drag.originalD,
          drag.pathAnchorIndex,
          newX,
          newY,
        );
        drag.currentD = newD;
        applyPathD(selection, newD);
        drawOverlay();
      } catch {}
      return;
    }
    if (
      drag.mode === "pathHandle" &&
      selection &&
      drag.originalD &&
      drag.pathAnchorIndex !== undefined &&
      drag.pathHandleIndex !== undefined
    ) {
      const rect = syncNodeRect(selection);
      const newX = Math.round(event.clientX / camera.z + camera.x - rect.x);
      const newY = Math.round(event.clientY / camera.z + camera.y - rect.y);
      try {
        let newD = moveControlHandle(
          drag.originalD,
          drag.pathAnchorIndex,
          drag.pathHandleIndex,
          newX,
          newY,
        );
        if (!event.altKey) {
          const anchors = getAnchorPoints(drag.originalD);
          const anchor = anchors[drag.pathAnchorIndex];
          if (anchor) {
            const dx = newX - anchor.x;
            const dy = newY - anchor.y;
            const oppositeIndex = drag.pathHandleIndex === 0 ? 1 : 0;
            try {
              newD = moveControlHandle(
                newD,
                drag.pathAnchorIndex,
                oppositeIndex,
                Math.round(anchor.x - dx),
                Math.round(anchor.y - dy),
              );
            } catch {}
          }
        }
        drag.currentD = newD;
        applyPathD(selection, newD);
        drawOverlay();
      } catch {}
      return;
    }
    if (prototypeMode) {
      const target = (event.target as HTMLElement)?.closest<HTMLElement>(
        "[data-prototype-navigate], [data-prototype-hover]",
      );
      if (target) {
        host.style.cursor =
          target.getAttribute("data-prototype-cursor") || "pointer";
        if (target !== lastHoveredPrototypeEl) {
          if (lastHoveredPrototypeEl) {
            const orig = originalHoverStyles.get(lastHoveredPrototypeEl);
            if (orig !== undefined) lastHoveredPrototypeEl.style.cssText = orig;
            lastHoveredPrototypeEl = null;
          }
          if (target.hasAttribute("data-prototype-hover")) {
            const hoverStr = target.getAttribute("data-prototype-hover");
            if (hoverStr) {
              try {
                const hoverObj = JSON.parse(hoverStr);
                originalHoverStyles.set(target, target.style.cssText);
                Object.assign(target.style, hoverObj);
                lastHoveredPrototypeEl = target;
              } catch {}
            }
          }
        }
      } else {
        host.style.cursor = "default";
        if (lastHoveredPrototypeEl) {
          const orig = originalHoverStyles.get(lastHoveredPrototypeEl);
          if (orig !== undefined) lastHoveredPrototypeEl.style.cssText = orig;
          lastHoveredPrototypeEl = null;
        }
      }
      return;
    }
    lastMouseClient = { x: event.clientX, y: event.clientY };
    if (altPressed && selection) {
      hoveredNode = hitTest(event.clientX, event.clientY);
    }
    if (drag.mode === "none" && !editingText) {
      const lh = layoutHandleAtPoint(
        currentLayoutHandles,
        event.clientX,
        event.clientY,
      );
      const refHit = referenceLineAtPoint(
        referenceLines,
        camera,
        event.clientX,
        event.clientY,
      );
      if (event.clientY <= 20 || event.clientX <= 20 || refHit) {
        host.style.cursor = "crosshair";
      } else if (lh) {
        if (lh.type === "gap") {
          host.style.cursor =
            lh.direction === "vertical" ? "ns-resize" : "ew-resize";
        } else if (lh.type === "padding") {
          host.style.cursor =
            lh.edge === "top" || lh.edge === "bottom"
              ? "ns-resize"
              : "ew-resize";
        }
      } else if (handleAtPoint(event.clientX, event.clientY)) {
        host.style.cursor = "pointer";
      } else if (toolMode === "hand" || spacePressed) {
        host.style.cursor = "grab";
      } else {
        host.style.cursor = "default";
      }
    }
    if (drag.mode === "none" || editingText) {
      drawOverlay();
      return;
    }
    if (drag.mode === "reference" && activeReferenceLine) {
      if (activeReferenceLine.axis === "x") {
        activeReferenceLine.position = event.clientX / camera.z + camera.x;
      } else {
        activeReferenceLine.position = event.clientY / camera.z + camera.y;
      }
      drawOverlay();
      return;
    }
    if (drag.mode === "gap" && drag.activeLayoutHandle && selection) {
      const dx = (event.clientX - drag.x) / camera.z;
      const dy = (event.clientY - drag.y) / camera.z;
      const delta = drag.activeLayoutHandle.direction === "vertical" ? dy : dx;
      const newValue = Math.max(0, Math.round((drag.originValue ?? 0) + delta));
      drag.activeLayoutHandle.value = newValue;
      if (selection.element instanceof HTMLElement) {
        selection.element.style.gap = `${newValue}px`;
      }
      drawOverlay();
      return;
    }
    if (drag.mode === "padding" && drag.activeLayoutHandle && selection) {
      const dx = (event.clientX - drag.x) / camera.z;
      const dy = (event.clientY - drag.y) / camera.z;
      const edge = drag.activeLayoutHandle.edge;
      let delta = 0;
      if (edge === "top") delta = dy;
      else if (edge === "bottom") delta = -dy;
      else if (edge === "left") delta = dx;
      else if (edge === "right") delta = -dx;
      const newValue = Math.max(0, Math.round((drag.originValue ?? 0) + delta));
      drag.activeLayoutHandle.value = newValue;
      if (selection.element instanceof HTMLElement) {
        if (edge === "top")
          selection.element.style.paddingTop = `${newValue}px`;
        else if (edge === "bottom")
          selection.element.style.paddingBottom = `${newValue}px`;
        else if (edge === "left")
          selection.element.style.paddingLeft = `${newValue}px`;
        else if (edge === "right")
          selection.element.style.paddingRight = `${newValue}px`;
      }
      drawOverlay();
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
    if (drag.mode === "create" && createPreview) {
      createPreview.x1 = event.clientX / camera.z + camera.x;
      createPreview.y1 = event.clientY / camera.z + camera.y;
      drawOverlay();
      return;
    }
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
  }
  const endDrag = (event: PointerEvent) => {
    if (drag.mode === "none") return;
    if (drag.mode === "pen") {
      if (penDraft) penDraft.draggingHandle = false;
      drag.mode = "none";
      drawOverlay();
      return;
    }
    if (drag.mode === "pathAnchor" || drag.mode === "pathHandle") {
      if (selection && drag.currentD && drag.currentD !== drag.originalD) {
        const finalD = drag.currentD;
        bridge?.send("ombrique:canvasEdit", {
          commands: [
            {
              kind: "setAttrs",
              target: {
                file: selection.file,
                start: 0,
                end: 0,
                path: selection.path,
              },
              attrs: { d: finalD },
            },
          ],
        });
      }
      drag.mode = "none";
      drag.originalD = undefined;
      drag.currentD = undefined;
      drag.originPoint = undefined;
      drawOverlay();
      return;
    }
    if (drag.mode === "reference") {
      if (activeReferenceLine) {
        if (
          (activeReferenceLine.axis === "y" && event.clientY <= 20) ||
          (activeReferenceLine.axis === "x" && event.clientX <= 20)
        ) {
          const idx = referenceLines.indexOf(activeReferenceLine);
          if (idx >= 0) referenceLines.splice(idx, 1);
        }
      }
      drag.mode = "none";
      activeReferenceLine = null;
      drawOverlay();
      return;
    }
    if (drag.mode === "gap" && drag.activeLayoutHandle && selection) {
      commitGap(selection, drag.activeLayoutHandle.value);
      drag.mode = "none";
      drag.activeLayoutHandle = null;
      activeLayoutHandle = null;
      drawOverlay();
      return;
    }
    if (drag.mode === "padding" && drag.activeLayoutHandle && selection) {
      if (drag.activeLayoutHandle.edge) {
        commitPadding(
          selection,
          drag.activeLayoutHandle.edge,
          drag.activeLayoutHandle.value,
        );
      }
      drag.mode = "none";
      drag.activeLayoutHandle = null;
      activeLayoutHandle = null;
      drawOverlay();
      return;
    }
    const dx = (event.clientX - drag.x) / camera.z;
    const dy = (event.clientY - drag.y) / camera.z;
    const origin = drag.originRect;
    if (createPreview) {
      const preview = createPreview;
      createPreview = null;
      const kind = toolMode;
      const board = currentFile ? boards.get(currentFile) : undefined;
      if (board && currentFile && isCreateTool(kind)) {
        const boardOrigin = boardWorldOrigin(board.element);
        const rawWidth = Math.abs(preview.x1 - preview.x0);
        const rawHeight = Math.abs(preview.y1 - preview.y0);
        const isClick = rawWidth < 4 && rawHeight < 4;
        const x = Math.round(Math.min(preview.x0, preview.x1) - boardOrigin.x);
        const y = Math.round(Math.min(preview.y0, preview.y1) - boardOrigin.y);
        const width = Math.max(
          1,
          Math.round(isClick ? (kind === "text" ? 240 : 100) : rawWidth),
        );
        const height = Math.max(
          1,
          Math.round(isClick ? (kind === "frame" ? 180 : 100) : rawHeight),
        );
        const spec =
          kind === "text"
            ? { kind, text: "Text", x, y, width, fill: "#14141a" }
            : { kind, name: kind, x, y, width, height, fill: "#d9d9d9" };
        bridge?.send("ombrique:canvasEdit", {
          commands: [
            {
              kind: "createNodes",
              parent: null,
              pageFile: currentFile,
              index: 0,
              specs: [spec],
            },
          ],
        });
      }
      activateTool("select");
    }
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
          if (!element.isConnected) continue;
          const eRect = worldRectOf(element);
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
      const finalDx = drag.snappedDx ?? dx;
      const finalDy = drag.snappedDy ?? dy;
      if (multiSelection.length > 1) {
        commitMultiMove(finalDx, finalDy);
      } else {
        commitMove(selection, finalDx, finalDy);
      }
    } else if (
      drag.mode === "scale" &&
      selection &&
      drag.handle &&
      drag.moved &&
      origin
    ) {
      const finalDx = drag.snappedDx ?? dx;
      const finalDy = drag.snappedDy ?? dy;
      commitScale(selection, drag.handle, origin, finalDx, finalDy);
    }
    try {
      host.releasePointerCapture(event.pointerId);
    } catch {}
    drag.mode = "none";
    drag.handle = null;
    drag.originRect = null;
    drag.nodeOrigins = undefined;
    pendingDragRestores = drag.restores ?? null;
    drag.restores = undefined;
    activeSmartGuides = null;
    drag.snappedDx = undefined;
    drag.snappedDy = undefined;
    drawOverlay();
  };
  host.addEventListener("pointerup", (event) => {
    if (pendingPointerMove) {
      const move = pendingPointerMove;
      pendingPointerMove = null;
      if (pointerMoveRaf) {
        cancelAnimationFrame(pointerMoveRaf);
        pointerMoveRaf = 0;
      }
      handlePointerMove(move);
    }
    endDrag(event);
    endNodeInteraction();
  });
  host.addEventListener("pointercancel", () => {
    endNodeInteraction();
    drag.mode = "none";
    drag.handle = null;
    drag.originRect = null;
    drag.moved = false;
    drag.nodeOrigins = undefined;
    drag.restores = undefined;
    activeSmartGuides = null;
    drag.snappedDx = undefined;
    drag.snappedDy = undefined;
    activeReferenceLine = null;
    activeLayoutHandle = null;
    marquee = null;
    createPreview = null;
    drawOverlay();
  });
  host.addEventListener("dragstart", (event) => {
    const target = event.target as Node | null;
    if (editingText && target && editingText.contains(target)) return;
    event.preventDefault();
  });
  host.addEventListener("wheel", (event) => {
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
    updateBoardResolutions();
    refreshSelectionRect();
    emitZoom();
    drawOverlay();
  });
  host.addEventListener("dblclick", (event) => {
    if (toolMode === "pen") {
      finishPenPath(false);
      return;
    }
    const hit = hitTest(event.clientX, event.clientY);
    if (!hit) return;
    selectSingle(hit);
    beginTextEdit();
  });
  host.addEventListener("contextmenu", (event) => {
    if (selection && isPathNode(selection)) {
      const hitAnchor = findPathAnchorAtPoint(event.clientX, event.clientY);
      if (hitAnchor) {
        event.preventDefault();
        document.getElementById("path-context-menu")?.remove();

        const menu = document.createElement("div");
        menu.id = "path-context-menu";
        menu.style.position = "fixed";
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.style.backgroundColor = "#ffffff";
        menu.style.border = "1px solid #d4d4d8";
        menu.style.borderRadius = "6px";
        menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
        menu.style.padding = "4px";
        menu.style.zIndex = "100";
        menu.style.minWidth = "120px";
        menu.style.fontSize = "12px";
        menu.style.fontFamily = "sans-serif";

        const item = document.createElement("div");
        item.textContent = "Delete Point";
        item.style.padding = "6px 12px";
        item.style.cursor = "pointer";
        item.style.borderRadius = "4px";
        item.addEventListener("mouseenter", () => {
          item.style.backgroundColor = "#f4f4f5";
        });
        item.addEventListener("mouseleave", () => {
          item.style.backgroundColor = "transparent";
        });
        item.addEventListener("click", () => {
          menu.remove();
          if (!selection) return;
          const sel = selection;
          const d = getPathData(sel);
          if (d) {
            const newD = deleteAnchorPoint(d, hitAnchor.index);
            applyPathD(sel, newD);
            bridge?.send("ombrique:canvasEdit", {
              commands: [
                {
                  kind: "setAttrs",
                  target: {
                    file: sel.file,
                    start: 0,
                    end: 0,
                    path: sel.path,
                  },
                  attrs: { d: newD },
                },
              ],
            });
            drawOverlay();
          }
        });

        menu.appendChild(item);
        document.body.appendChild(menu);

        const dismiss = (e: MouseEvent) => {
          if (!menu.contains(e.target as Node)) {
            menu.remove();
            window.removeEventListener("pointerdown", dismiss);
          }
        };
        window.addEventListener("pointerdown", dismiss);
      }
    }
  });

  bridge?.onProject((message) => {
    manifest = message.manifest;
    applyTokensCss(message.files);
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

  bridge?.onFiles((payload) => {
    applyTokensCss((payload as { files?: unknown } | null)?.files);
  });

  bridge?.onCommandFailed(() => {
    const restores = pendingDragRestores;
    pendingDragRestores = null;
    if (drag.restores) {
      drag.restores = undefined;
    }
    for (const restore of restores ?? []) restore();
    drawOverlay();
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
    requestId?: string;
    file: string;
    outPath?: string;
    path?: number[];
    format?: "png" | "jpg" | "webp" | "svg";
    scale?: number;
  }) {
    const scale = req.scale ?? 2;
    const format = req.format ?? "png";
    const outPath = req.outPath ?? "";

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
          outPath,
          requestId: req.requestId,
          ok: false,
        });
        return;
      }
      const svgStr = serializeNodeToSvg(targetEl, { scale });
      const bytes = new TextEncoder().encode(svgStr).buffer;
      bridge?.send("ombrique:exportResult", {
        outPath,
        requestId: req.requestId,
        ok: true,
        bytes,
        svg: svgStr,
      });
      return;
    }

    const board = boards.get(req.file);
    if (!board || !compositor) {
      bridge?.send("ombrique:exportResult", {
        outPath,
        requestId: req.requestId,
        ok: false,
      });
      return;
    }
    const result = await compositor.exportBoard(board.element, scale);
    if (!result) {
      bridge?.send("ombrique:exportResult", {
        outPath,
        requestId: req.requestId,
        ok: false,
      });
      return;
    }

    let cropX = 0;
    let cropY = 0;
    let cropW = result.width;
    let cropH = result.height;

    if (req.path) {
      const targetPathStr = req.path.join("/");
      let targetEl: HTMLElement | SVGElement | null = null;
      for (const [el, info] of nodeIndex) {
        if (info.file === req.file && info.path.join("/") === targetPathStr) {
          targetEl = el as HTMLElement | SVGElement;
          break;
        }
      }
      if (targetEl) {
        const boardRect = board.element.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const relX = targetRect.left - boardRect.left;
        const relY = targetRect.top - boardRect.top;
        cropX = Math.max(
          0,
          Math.min(result.width - 1, Math.round(relX * scale)),
        );
        cropY = Math.max(
          0,
          Math.min(result.height - 1, Math.round(relY * scale)),
        );
        cropW = Math.max(
          1,
          Math.min(result.width - cropX, Math.round(targetRect.width * scale)),
        );
        cropH = Math.max(
          1,
          Math.min(
            result.height - cropY,
            Math.round(targetRect.height * scale),
          ),
        );
      }
    }

    const fullCanvas = new OffscreenCanvas(result.width, result.height);
    const fullCtx = fullCanvas.getContext("2d");
    if (!fullCtx) return;
    fullCtx.putImageData(
      new ImageData(
        new Uint8ClampedArray(result.rgba),
        result.width,
        result.height,
      ),
      0,
      0,
    );

    const cropCanvas = new OffscreenCanvas(cropW, cropH);
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return;

    if (format === "jpg") {
      cropCtx.fillStyle = "#ffffff";
      cropCtx.fillRect(0, 0, cropW, cropH);
    }
    cropCtx.drawImage(
      fullCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH,
    );

    const mime =
      format === "jpg"
        ? "image/jpeg"
        : format === "webp"
          ? "image/webp"
          : "image/png";
    const quality = format === "jpg" ? 0.92 : undefined;
    const blob = await cropCanvas.convertToBlob({ type: mime, quality });
    const bytes = await blob.arrayBuffer();
    bridge?.send("ombrique:exportResult", {
      outPath,
      requestId: req.requestId,
      ok: true,
      bytes,
      width: cropW,
      height: cropH,
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
        requestId?: string;
        file: string;
        outPath?: string;
        path?: number[];
        format?: "png" | "jpg" | "webp" | "svg";
        scale?: number;
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
    if (command?.channel === "ombrique:prototypeMode") {
      setPrototypeMode(Boolean(command.payload));
      return;
    }
    if (command?.channel === "ombrique:showHotspots") {
      showHotspots = Boolean(command.payload);
      drawOverlay();
      return;
    }
    if (command?.channel === "ombrique:navigatePage") {
      const target = String(command.payload);
      if (target) void navigatePrototypePage(target);
      return;
    }
    if (command?.channel === "ombrique:comments") {
      const threads = command.payload;
      commentThreads = Array.isArray(threads)
        ? (threads.filter(
            (thread): thread is CommentThread =>
              Boolean(thread) && typeof thread === "object",
          ) as CommentThread[])
        : [];
      drawOverlay();
      return;
    }
    if (command?.channel === "ombrique:toolChanged") {
      const tool = command.payload as CanvasTool | null;
      if (
        tool === "select" ||
        tool === "hand" ||
        tool === "frame" ||
        tool === "rect" ||
        tool === "ellipse" ||
        tool === "star" ||
        tool === "pen" ||
        tool === "text" ||
        tool === "comment"
      ) {
        toolMode = tool;
        renderToolSwitcher();
      }
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
      updateBoardResolutions();
      refreshSelectionRect();
      emitZoom();
      drawOverlay();
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
    boardScales.clear();
    invalidateGuideTargets();
    const active =
      manifest.pages.find((page) => page.file === currentFile) ??
      manifest.pages[0];
    if (active) void mountPage(active.file);
  });
}

void init();
