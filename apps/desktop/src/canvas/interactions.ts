import {
  type EqualSpacingGuide,
  type GuideRect,
  type ReferenceLine,
  type SmartGuideLine,
  measureBetweenRects,
} from "@ombrique/canvas";

export interface CameraState {
  x: number;
  y: number;
  z: number;
}

export type LayoutHandleType = "gap" | "padding";
export type PaddingEdge = "top" | "right" | "bottom" | "left";

export interface LayoutHandle {
  type: LayoutHandleType;
  edge?: PaddingEdge;
  index?: number;
  direction?: "horizontal" | "vertical" | "grid";
  rect: { x: number; y: number; width: number; height: number };
  value: number;
}

export interface AutoLayoutInfo {
  isAutoLayout: boolean;
  direction: "horizontal" | "vertical" | "grid";
  gap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  children: HTMLElement[];
}

export function getAutoLayoutInfo(element: Element): AutoLayoutInfo | null {
  if (!(element instanceof HTMLElement)) return null;
  const computed = window.getComputedStyle(element);
  const layoutAttr = element.getAttribute("data-layout");
  const isFlex =
    computed.display === "flex" || computed.display === "inline-flex";
  const isGrid =
    computed.display === "grid" || computed.display === "inline-grid";
  if (!isFlex && !isGrid && !layoutAttr) return null;

  const direction: "vertical" | "horizontal" | "grid" = isGrid
    ? "grid"
    : computed.flexDirection === "column" ||
        computed.flexDirection === "column-reverse" ||
        layoutAttr === "vertical"
      ? "vertical"
      : "horizontal";

  const rawGap = computed.gap || element.style.gap || "0";
  const gap = Number.parseFloat(rawGap) || 0;
  const pTop =
    Number.parseFloat(computed.paddingTop || element.style.paddingTop || "0") ||
    0;
  const pRight =
    Number.parseFloat(
      computed.paddingRight || element.style.paddingRight || "0",
    ) || 0;
  const pBottom =
    Number.parseFloat(
      computed.paddingBottom || element.style.paddingBottom || "0",
    ) || 0;
  const pLeft =
    Number.parseFloat(
      computed.paddingLeft || element.style.paddingLeft || "0",
    ) || 0;

  const children = Array.from(element.children).filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement && c.offsetParent !== null,
  );

  return {
    isAutoLayout: true,
    direction,
    gap,
    paddingTop: pTop,
    paddingRight: pRight,
    paddingBottom: pBottom,
    paddingLeft: pLeft,
    children,
  };
}

export function computeLayoutHandles(
  info: AutoLayoutInfo,
  parentRect: GuideRect,
  camera: CameraState,
  childRectFn: (el: HTMLElement) => GuideRect,
): LayoutHandle[] {
  const handles: LayoutHandle[] = [];

  for (let i = 0; i < info.children.length - 1; i++) {
    const currentEl = info.children[i];
    const nextEl = info.children[i + 1];
    if (!currentEl || !nextEl) continue;
    const r1 = childRectFn(currentEl);
    const r2 = childRectFn(nextEl);

    let worldX = 0;
    let worldY = 0;
    let width = 32;
    let height = 18;

    if (info.direction === "vertical") {
      worldX = parentRect.x + parentRect.width / 2;
      worldY = (r1.y + r1.height + r2.y) / 2;
      width = Math.max(30, 22 + String(Math.round(info.gap)).length * 7);
      height = 18;
    } else if (info.direction === "horizontal") {
      worldX = (r1.x + r1.width + r2.x) / 2;
      worldY = parentRect.y + parentRect.height / 2;
      width = Math.max(30, 22 + String(Math.round(info.gap)).length * 7);
      height = 18;
    } else {
      worldX = (r1.x + r1.width / 2 + r2.x + r2.width / 2) / 2;
      worldY = (r1.y + r1.height / 2 + r2.y + r2.height / 2) / 2;
    }

    const screenX = (worldX - camera.x) * camera.z - width / 2;
    const screenY = (worldY - camera.y) * camera.z - height / 2;

    handles.push({
      type: "gap",
      index: i,
      direction: info.direction,
      rect: { x: screenX, y: screenY, width, height },
      value: Math.round(info.gap),
    });
  }

  const pTop = info.paddingTop;
  const pBottom = info.paddingBottom;
  const pLeft = info.paddingLeft;
  const pRight = info.paddingRight;

  const topCenterY = parentRect.y + Math.max(8 / camera.z, pTop / 2);
  const topCenterX = parentRect.x + parentRect.width / 2;
  const topW = Math.max(28, 20 + String(Math.round(pTop)).length * 7);
  handles.push({
    type: "padding",
    edge: "top",
    rect: {
      x: (topCenterX - camera.x) * camera.z - topW / 2,
      y: (topCenterY - camera.y) * camera.z - 8,
      width: topW,
      height: 16,
    },
    value: Math.round(pTop),
  });

  const bottomCenterY =
    parentRect.y + parentRect.height - Math.max(8 / camera.z, pBottom / 2);
  const bottomW = Math.max(28, 20 + String(Math.round(pBottom)).length * 7);
  handles.push({
    type: "padding",
    edge: "bottom",
    rect: {
      x: (topCenterX - camera.x) * camera.z - bottomW / 2,
      y: (bottomCenterY - camera.y) * camera.z - 8,
      width: bottomW,
      height: 16,
    },
    value: Math.round(pBottom),
  });

  const leftCenterX = parentRect.x + Math.max(8 / camera.z, pLeft / 2);
  const leftCenterY = parentRect.y + parentRect.height / 2;
  const leftW = Math.max(28, 20 + String(Math.round(pLeft)).length * 7);
  handles.push({
    type: "padding",
    edge: "left",
    rect: {
      x: (leftCenterX - camera.x) * camera.z - leftW / 2,
      y: (leftCenterY - camera.y) * camera.z - 8,
      width: leftW,
      height: 16,
    },
    value: Math.round(pLeft),
  });

  const rightCenterX =
    parentRect.x + parentRect.width - Math.max(8 / camera.z, pRight / 2);
  const rightW = Math.max(28, 20 + String(Math.round(pRight)).length * 7);
  handles.push({
    type: "padding",
    edge: "right",
    rect: {
      x: (rightCenterX - camera.x) * camera.z - rightW / 2,
      y: (leftCenterY - camera.y) * camera.z - 8,
      width: rightW,
      height: 16,
    },
    value: Math.round(pRight),
  });

  return handles;
}

export function layoutHandleAtPoint(
  handles: LayoutHandle[],
  clientX: number,
  clientY: number,
): LayoutHandle | null {
  for (const handle of handles) {
    if (
      clientX >= handle.rect.x &&
      clientX <= handle.rect.x + handle.rect.width &&
      clientY >= handle.rect.y &&
      clientY <= handle.rect.y + handle.rect.height
    ) {
      return handle;
    }
  }
  return null;
}

export const DRAG_THRESHOLD_PX = 3;

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

export function referenceLineAtPoint(
  lines: ReferenceLine[],
  camera: CameraState,
  clientX: number,
  clientY: number,
  threshold = 6,
): ReferenceLine | null {
  for (const line of lines) {
    if (line.axis === "x") {
      const sx = (line.position - camera.x) * camera.z;
      if (Math.abs(clientX - sx) <= threshold && clientY >= 20) {
        return line;
      }
    } else {
      const sy = (line.position - camera.y) * camera.z;
      if (Math.abs(clientY - sy) <= threshold && clientX >= 20) {
        return line;
      }
    }
  }
  return null;
}

export function renderSmartGuidesOverlay(
  overlay: HTMLElement,
  camera: CameraState,
  lines: SmartGuideLine[],
  spacing: EqualSpacingGuide[],
): void {
  for (const line of lines) {
    const el = document.createElement("div");
    el.className = "smart-guide-line";
    if (line.axis === "x") {
      const sx = (line.position - camera.x) * camera.z;
      const sy1 = (line.start - camera.y) * camera.z;
      const sy2 = (line.end - camera.y) * camera.z;
      el.style.cssText = `position:absolute;left:${sx - 0.5}px;top:${Math.min(sy1, sy2)}px;width:1px;height:${Math.max(1, Math.abs(sy2 - sy1))}px;background:#ff007a;box-shadow:0 0 2px rgba(255,0,122,0.8);pointer-events:none;z-index:6;`;
    } else {
      const sy = (line.position - camera.y) * camera.z;
      const sx1 = (line.start - camera.x) * camera.z;
      const sx2 = (line.end - camera.x) * camera.z;
      el.style.cssText = `position:absolute;left:${Math.min(sx1, sx2)}px;top:${sy - 0.5}px;width:${Math.max(1, Math.abs(sx2 - sx1))}px;height:1px;background:#ff007a;box-shadow:0 0 2px rgba(255,0,122,0.8);pointer-events:none;z-index:6;`;
    }
    overlay.appendChild(el);
  }

  for (const s of spacing) {
    const container = document.createElement("div");
    container.className = "smart-guide-spacing";
    container.style.cssText =
      "position:absolute;pointer-events:none;z-index:7;";

    if (s.axis === "x") {
      const sx1 = (s.from - camera.x) * camera.z;
      const sx2 = (s.to - camera.x) * camera.z;
      const sy = (s.cross - camera.y) * camera.z;
      const left = Math.min(sx1, sx2);
      const width = Math.max(1, Math.abs(sx2 - sx1));

      const bar = document.createElement("div");
      bar.style.cssText = `position:absolute;left:${left}px;top:${sy - 0.5}px;width:${width}px;height:1px;background:#ff007a;`;
      container.appendChild(bar);

      const tick1 = document.createElement("div");
      tick1.style.cssText = `position:absolute;left:${sx1 - 0.5}px;top:${sy - 4}px;width:1px;height:8px;background:#ff007a;`;
      container.appendChild(tick1);

      const tick2 = document.createElement("div");
      tick2.style.cssText = `position:absolute;left:${sx2 - 0.5}px;top:${sy - 4}px;width:1px;height:8px;background:#ff007a;`;
      container.appendChild(tick2);

      const badge = document.createElement("div");
      badge.textContent = `${Math.round(s.value)}`;
      badge.style.cssText = `position:absolute;left:${left + width / 2}px;top:${sy}px;transform:translate(-50%,-50%);background:#ff007a;color:#ffffff;font-size:10px;font-family:sans-serif;font-weight:600;padding:1px 4px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      container.appendChild(badge);
    } else {
      const sy1 = (s.from - camera.y) * camera.z;
      const sy2 = (s.to - camera.y) * camera.z;
      const sx = (s.cross - camera.x) * camera.z;
      const top = Math.min(sy1, sy2);
      const height = Math.max(1, Math.abs(sy2 - sy1));

      const bar = document.createElement("div");
      bar.style.cssText = `position:absolute;left:${sx - 0.5}px;top:${top}px;width:1px;height:${height}px;background:#ff007a;`;
      container.appendChild(bar);

      const tick1 = document.createElement("div");
      tick1.style.cssText = `position:absolute;left:${sx - 4}px;top:${sy1 - 0.5}px;width:8px;height:1px;background:#ff007a;`;
      container.appendChild(tick1);

      const tick2 = document.createElement("div");
      tick2.style.cssText = `position:absolute;left:${sx - 4}px;top:${sy2 - 0.5}px;width:8px;height:1px;background:#ff007a;`;
      container.appendChild(tick2);

      const badge = document.createElement("div");
      badge.textContent = `${Math.round(s.value)}`;
      badge.style.cssText = `position:absolute;left:${sx}px;top:${top + height / 2}px;transform:translate(-50%,-50%);background:#ff007a;color:#ffffff;font-size:10px;font-family:sans-serif;font-weight:600;padding:1px 4px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      container.appendChild(badge);
    }

    overlay.appendChild(container);
  }
}

export function renderAltMeasurementsOverlay(
  overlay: HTMLElement,
  camera: CameraState,
  selectedRect: GuideRect,
  hoveredRect: GuideRect,
): void {
  const hoverBox = document.createElement("div");
  hoverBox.className = "alt-hover-outline";
  hoverBox.style.cssText = `position:absolute;left:${(hoveredRect.x - camera.x) * camera.z}px;top:${(hoveredRect.y - camera.y) * camera.z}px;width:${hoveredRect.width * camera.z}px;height:${hoveredRect.height * camera.z}px;border:1px dashed #ff2442;box-sizing:border-box;pointer-events:none;z-index:7;`;
  overlay.appendChild(hoverBox);

  const measurements = measureBetweenRects(selectedRect, hoveredRect);

  for (const m of measurements) {
    const wrap = document.createElement("div");
    wrap.className = "alt-measurement-line";
    wrap.style.cssText = "position:absolute;pointer-events:none;z-index:8;";

    if (m.axis === "x") {
      const sx1 = (m.from - camera.x) * camera.z;
      const sx2 = (m.to - camera.x) * camera.z;
      const sy = (m.cross - camera.y) * camera.z;
      const left = Math.min(sx1, sx2);
      const width = Math.max(1, Math.abs(sx2 - sx1));

      const line = document.createElement("div");
      line.style.cssText = `position:absolute;left:${left}px;top:${sy - 0.5}px;width:${width}px;height:1px;background:#ff2442;`;
      wrap.appendChild(line);

      const tick1 = document.createElement("div");
      tick1.style.cssText = `position:absolute;left:${sx1 - 0.5}px;top:${sy - 5}px;width:1px;height:10px;background:#ff2442;`;
      wrap.appendChild(tick1);

      const tick2 = document.createElement("div");
      tick2.style.cssText = `position:absolute;left:${sx2 - 0.5}px;top:${sy - 5}px;width:1px;height:10px;background:#ff2442;`;
      wrap.appendChild(tick2);

      const pill = document.createElement("div");
      pill.textContent = `${m.value}`;
      pill.style.cssText = `position:absolute;left:${left + width / 2}px;top:${sy}px;transform:translate(-50%,-50%);background:#ff2442;color:#ffffff;font-size:11px;font-family:sans-serif;font-weight:600;padding:2px 5px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      wrap.appendChild(pill);
    } else {
      const sy1 = (m.from - camera.y) * camera.z;
      const sy2 = (m.to - camera.y) * camera.z;
      const sx = (m.cross - camera.x) * camera.z;
      const top = Math.min(sy1, sy2);
      const height = Math.max(1, Math.abs(sy2 - sy1));

      const line = document.createElement("div");
      line.style.cssText = `position:absolute;left:${sx - 0.5}px;top:${top}px;width:1px;height:${height}px;background:#ff2442;`;
      wrap.appendChild(line);

      const tick1 = document.createElement("div");
      tick1.style.cssText = `position:absolute;left:${sx - 5}px;top:${sy1 - 0.5}px;width:10px;height:1px;background:#ff2442;`;
      wrap.appendChild(tick1);

      const tick2 = document.createElement("div");
      tick2.style.cssText = `position:absolute;left:${sx - 5}px;top:${sy2 - 0.5}px;width:10px;height:1px;background:#ff2442;`;
      wrap.appendChild(tick2);

      const pill = document.createElement("div");
      pill.textContent = `${m.value}`;
      pill.style.cssText = `position:absolute;left:${sx}px;top:${top + height / 2}px;transform:translate(-50%,-50%);background:#ff2442;color:#ffffff;font-size:11px;font-family:sans-serif;font-weight:600;padding:2px 5px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      wrap.appendChild(pill);
    }

    overlay.appendChild(wrap);
  }
}

export function renderLayoutHandlesOverlay(
  overlay: HTMLElement,
  handles: LayoutHandle[],
  activeHandle: LayoutHandle | null,
): void {
  for (const h of handles) {
    const el = document.createElement("div");
    el.className = `layout-handle layout-handle-${h.type}`;
    const isActive =
      activeHandle &&
      activeHandle.type === h.type &&
      activeHandle.edge === h.edge &&
      activeHandle.index === h.index;
    const bg = isActive ? "rgba(76, 141, 255, 0.95)" : "rgba(35, 36, 44, 0.85)";
    const border = isActive ? "1px solid #4c8dff" : "1px solid #6b7280";
    const color = isActive ? "#ffffff" : "#e5e7eb";

    el.style.cssText = `position:absolute;left:${h.rect.x}px;top:${h.rect.y}px;width:${h.rect.width}px;height:${h.rect.height}px;background:${bg};border:${border};color:${color};border-radius:9999px;font-size:10px;font-family:sans-serif;font-weight:500;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.35);backdrop-filter:blur(3px);pointer-events:none;z-index:9;user-select:none;`;
    el.textContent = `${h.value}`;
    overlay.appendChild(el);
  }
}

export function renderReferenceLinesOverlay(
  overlay: HTMLElement,
  camera: CameraState,
  lines: ReferenceLine[],
  activeRef: ReferenceLine | null,
): void {
  for (const ref of lines) {
    const isActive = activeRef === ref;
    const color = isActive ? "#00e5ff" : "#00c4ff";
    const lineEl = document.createElement("div");
    lineEl.className = "reference-line";

    if (ref.axis === "x") {
      const sx = (ref.position - camera.x) * camera.z;
      lineEl.style.cssText = `position:absolute;top:20px;bottom:0;left:${sx}px;width:1px;background:${color};pointer-events:none;z-index:15;box-shadow:0 0 2px rgba(0,196,255,0.6);`;
      const badge = document.createElement("div");
      badge.textContent = `${Math.round(ref.position)}`;
      badge.style.cssText = `position:absolute;left:${sx + 2}px;top:22px;background:${color};color:#000000;font-size:9px;font-family:sans-serif;font-weight:600;padding:1px 3px;border-radius:2px;pointer-events:none;z-index:16;`;
      overlay.appendChild(lineEl);
      overlay.appendChild(badge);
    } else {
      const sy = (ref.position - camera.y) * camera.z;
      lineEl.style.cssText = `position:absolute;left:20px;right:0;top:${sy}px;height:1px;background:${color};pointer-events:none;z-index:15;box-shadow:0 0 2px rgba(0,196,255,0.6);`;
      const badge = document.createElement("div");
      badge.textContent = `${Math.round(ref.position)}`;
      badge.style.cssText = `position:absolute;left:24px;top:${sy + 2}px;background:${color};color:#000000;font-size:9px;font-family:sans-serif;font-weight:600;padding:1px 3px;border-radius:2px;pointer-events:none;z-index:16;`;
      overlay.appendChild(lineEl);
      overlay.appendChild(badge);
    }
  }
}

interface PersistentRulers {
  container: HTMLElement;
  top: HTMLCanvasElement;
  left: HTMLCanvasElement;
  corner: HTMLElement;
  cursorX: HTMLElement;
  cursorY: HTMLElement;
  lastDrawKey?: string;
}

let persistentRulers: PersistentRulers | null = null;

function getOrCreateRulers(overlay: HTMLElement): PersistentRulers {
  const existingContainer = document.getElementById("rulers");
  if (existingContainer) {
    const top = document.getElementById("ruler-top") as HTMLCanvasElement;
    const left = document.getElementById("ruler-left") as HTMLCanvasElement;
    const corner = document.getElementById("ruler-corner") as HTMLElement;
    const cursorX = document.getElementById("ruler-cursor-x") as HTMLElement;
    const cursorY = document.getElementById("ruler-cursor-y") as HTMLElement;
    if (top && left && corner && cursorX && cursorY) {
      if (!persistentRulers || persistentRulers.container !== existingContainer) {
        persistentRulers = {
          container: existingContainer,
          top,
          left,
          corner,
          cursorX,
          cursorY,
          lastDrawKey: persistentRulers?.lastDrawKey,
        };
      }
      return persistentRulers;
    }
  }

  if (persistentRulers && persistentRulers.container.isConnected) {
    return persistentRulers;
  }

  const container = document.createElement("div");
  container.id = "rulers";
  container.style.cssText =
    "position:absolute;inset:0;pointer-events:none;z-index:20;";

  const top = document.createElement("canvas");
  top.id = "ruler-top";
  top.style.cssText =
    "position:absolute;top:0;left:20px;height:20px;pointer-events:none;";

  const left = document.createElement("canvas");
  left.id = "ruler-left";
  left.style.cssText =
    "position:absolute;top:20px;left:0;width:20px;pointer-events:none;";

  const corner = document.createElement("div");
  corner.id = "ruler-corner";
  corner.style.cssText =
    "position:absolute;top:0;left:0;width:20px;height:20px;background:#14141a;border-right:1px solid #2e2e38;border-bottom:1px solid #2e2e38;pointer-events:none;";

  const cursorX = document.createElement("div");
  cursorX.id = "ruler-cursor-x";
  cursorX.style.cssText =
    "position:absolute;top:0;width:1px;height:20px;background:#4c8dff;pointer-events:none;display:none;";

  const cursorY = document.createElement("div");
  cursorY.id = "ruler-cursor-y";
  cursorY.style.cssText =
    "position:absolute;left:0;height:1px;width:20px;background:#4c8dff;pointer-events:none;display:none;";

  container.appendChild(top);
  container.appendChild(left);
  container.appendChild(corner);
  container.appendChild(cursorX);
  container.appendChild(cursorY);

  if (overlay.parentNode) {
    overlay.parentNode.insertBefore(container, overlay);
  } else {
    overlay.appendChild(container);
  }

  persistentRulers = { container, top, left, corner, cursorX, cursorY };
  return persistentRulers;
}

export function renderRulersOverlay(
  overlay: HTMLElement,
  camera: CameraState,
  mouseClient: { x: number; y: number } | null,
  visible = true,
): void {
  const rulers = getOrCreateRulers(overlay);
  if (!visible) {
    rulers.container.style.display = "none";
    return;
  }
  rulers.container.style.display = "";

  const width = overlay.clientWidth;
  const height = overlay.clientHeight;
  if (width <= 20 || height <= 20) return;

  const dpr = globalThis.devicePixelRatio || 1;
  const drawKey = `${camera.x}|${camera.y}|${camera.z}|${width}|${height}|${dpr}`;
  if (rulers.lastDrawKey !== drawKey) {
    rulers.lastDrawKey = drawKey;
    drawTopRuler(rulers.top, width, dpr, camera);
    drawLeftRuler(rulers.left, height, dpr, camera);
  }

  if (mouseClient && mouseClient.x >= 20) {
    rulers.cursorX.style.display = "block";
    rulers.cursorX.style.left = `${mouseClient.x}px`;
  } else {
    rulers.cursorX.style.display = "none";
  }

  if (mouseClient && mouseClient.y >= 20) {
    rulers.cursorY.style.display = "block";
    rulers.cursorY.style.top = `${mouseClient.y}px`;
  } else {
    rulers.cursorY.style.display = "none";
  }
}

function drawTopRuler(
  canvas: HTMLCanvasElement,
  width: number,
  dpr: number,
  camera: CameraState,
): void {
  const targetW = Math.max(1, Math.round((width - 20) * dpr));
  const targetH = Math.max(1, Math.round(20 * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.width = `${width - 20}px`;
    canvas.style.height = "20px";
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#181820";
  ctx.fillRect(0, 0, width - 20, 20);
  ctx.strokeStyle = "#3a3a46";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 19.5);
  ctx.lineTo(width - 20, 19.5);
  ctx.stroke();

  const candidateSteps = [
    1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
  ];
  let step = 100;
  for (const s of candidateSteps) {
    if (s * camera.z >= 45) {
      step = s;
      break;
    }
  }
  const subStep = step / 5;

  const minWorldX = camera.x;
  const maxWorldX = camera.x + (width - 20) / camera.z;
  const startX = Math.floor(minWorldX / subStep) * subStep;

  ctx.font = "9px sans-serif";
  ctx.textBaseline = "top";

  for (let wx = startX; wx <= maxWorldX + subStep; wx += subStep) {
    const sx = (wx - camera.x) * camera.z;
    if (sx < 0 || sx > width - 20) continue;
    const isMajor = Math.abs(Math.round(wx / step) * step - wx) < 0.001;
    ctx.strokeStyle = isMajor ? "#9fa0b2" : "#4a4a58";
    ctx.beginPath();
    ctx.moveTo(sx + 0.5, isMajor ? 10 : 15);
    ctx.lineTo(sx + 0.5, 20);
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = "#d0d2e0";
      ctx.fillText(`${Math.round(wx)}`, sx + 3, 2);
    }
  }
}

function drawLeftRuler(
  canvas: HTMLCanvasElement,
  height: number,
  dpr: number,
  camera: CameraState,
): void {
  const targetW = Math.max(1, Math.round(20 * dpr));
  const targetH = Math.max(1, Math.round((height - 20) * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.width = "20px";
    canvas.style.height = `${height - 20}px`;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#181820";
  ctx.fillRect(0, 0, 20, height - 20);
  ctx.strokeStyle = "#3a3a46";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(19.5, 0);
  ctx.lineTo(19.5, height - 20);
  ctx.stroke();

  const candidateSteps = [
    1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
  ];
  let step = 100;
  for (const s of candidateSteps) {
    if (s * camera.z >= 45) {
      step = s;
      break;
    }
  }
  const subStep = step / 5;

  const minWorldY = camera.y;
  const maxWorldY = camera.y + (height - 20) / camera.z;
  const startY = Math.floor(minWorldY / subStep) * subStep;

  ctx.font = "8px sans-serif";
  ctx.textBaseline = "middle";

  for (let wy = startY; wy <= maxWorldY + subStep; wy += subStep) {
    const sy = (wy - camera.y) * camera.z;
    if (sy < 0 || sy > height - 20) continue;
    const isMajor = Math.abs(Math.round(wy / step) * step - wy) < 0.001;
    ctx.strokeStyle = isMajor ? "#9fa0b2" : "#4a4a58";
    ctx.beginPath();
    ctx.moveTo(isMajor ? 10 : 15, sy + 0.5);
    ctx.lineTo(20, sy + 0.5);
    ctx.stroke();

    if (isMajor) {
      ctx.save();
      ctx.translate(2, sy + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#d0d2e0";
      ctx.fillText(`${Math.round(wy)}`, 0, 0);
      ctx.restore();
    }
  }
}
