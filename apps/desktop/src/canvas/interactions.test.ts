// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAG_THRESHOLD_PX,
  exceedsDragThreshold,
  renderRulersOverlay,
} from "./interactions";

const context = {
  scale: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  save: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  font: "",
  textBaseline: "",
};

vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
  context as unknown as GPUCanvasContext,
);

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function makeOverlay(): HTMLElement {
  const overlay = document.createElement("div");
  Object.defineProperty(overlay, "clientWidth", { value: 800 });
  Object.defineProperty(overlay, "clientHeight", { value: 600 });
  return overlay;
}

describe("renderRulersOverlay", () => {
  it("reuses ruler canvases while the camera is unchanged", () => {
    const parent = document.createElement("div");
    const overlay = makeOverlay();
    parent.appendChild(overlay);
    document.body.appendChild(parent);
    const camera = { x: 10, y: 20, z: 1 };

    renderRulersOverlay(overlay, camera, { x: 100, y: 100 });
    const rulers = document.getElementById("rulers");
    expect(rulers).toBeDefined();
    const topCanvas = document.getElementById("ruler-top") as HTMLCanvasElement;
    const leftCanvas = document.getElementById("ruler-left") as HTMLCanvasElement;
    expect(topCanvas).toBeDefined();
    expect(leftCanvas).toBeDefined();
    expect(context.fillRect).toHaveBeenCalledTimes(2);

    overlay.replaceChildren();
    renderRulersOverlay(overlay, camera, { x: 140, y: 120 });
    expect(document.getElementById("ruler-top")).toBe(topCanvas);
    expect(document.getElementById("ruler-left")).toBe(leftCanvas);
    // Camera didn't move, no re-drawing
    expect(context.fillRect).toHaveBeenCalledTimes(2);

    const cursorX = document.getElementById("ruler-cursor-x");
    expect(cursorX?.style.left).toBe("140px");
  });

  it("redraws ruler canvases when the camera moves without replacing canvases", () => {
    const parent = document.createElement("div");
    const overlay = makeOverlay();
    parent.appendChild(overlay);
    document.body.appendChild(parent);
    renderRulersOverlay(overlay, { x: 50, y: 60, z: 2 }, null);
    const topCanvas = document.getElementById("ruler-top");
    expect(context.fillRect).toHaveBeenCalledTimes(2);

    renderRulersOverlay(overlay, { x: 51, y: 60, z: 2 }, null);
    // Canvas element identity is preserved
    expect(document.getElementById("ruler-top")).toBe(topCanvas);
    // Re-drawn on camera change
    expect(context.fillRect).toHaveBeenCalledTimes(4);
  });
});

describe("exceedsDragThreshold", () => {
  it("ignores pointer jitter below the threshold", () => {
    expect(exceedsDragThreshold(1, 1)).toBe(false);
    expect(exceedsDragThreshold(-2, 0)).toBe(false);
    expect(exceedsDragThreshold(0, 0)).toBe(false);
  });

  it("detects movement at or beyond the threshold on either axis or diagonally", () => {
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX, 0)).toBe(true);
    expect(exceedsDragThreshold(0, -DRAG_THRESHOLD_PX)).toBe(true);
    expect(exceedsDragThreshold(3, 3)).toBe(true);
  });
});