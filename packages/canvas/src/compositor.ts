import { intersects, visibleRect, zoomAt as cameraZoomAt } from "./camera";
import type { Camera } from "./camera";
import { UploadQueue } from "./uploadQueue";
import { resolveElementImageUpload } from "./element-upload";
import { fitTextureSize } from "./texture-size";
import { shaderTextureSize, type ShaderInit } from "./shader-layer";

export interface BoardInit {
  el: Element;
  worldX: number;
  worldY: number;
  worldW: number;
  worldH: number;
}

export interface CompositorStats {
  fps: number;
  visible: number;
  uploads: number;
  paints: number;
}

export interface CompositorOptions {
  onStats?: (stats: CompositorStats) => void;
  onInitialUpload?: (ms: number, count: number) => void;
  onBoardUploaded?: (el: Element) => void;
  maxTextureBytes?: number;
  minZoom?: number;
  maxZoom?: number;
  clearColor?: { r: number; g: number; b: number; a: number };
  frameWaitTimeoutMs?: number;
}

export interface CameraHandle {
  set(cam: Camera): void;
  get(): Camera;
  zoomAt(factor: number, cx: number, cy: number): Camera;
  centerOn(
    wx: number,
    wy: number,
    viewportW: number,
    viewportH: number,
  ): Camera;
}

export interface Compositor {
  readonly canvas: HTMLCanvasElement;
  readonly camera: CameraHandle;
  setBoards(boards: BoardInit[]): void;
  setShaders(shaders: ShaderInit[]): void;
  flushUploads(): void;
  uploadAtScale(el: Element, scale: number): boolean;
  setInteractive(active: boolean): void;
  suspendBoard(el: Element): void;
  resumeBoard(el: Element): void;
  exportBoard(
    el: Element,
    scale: number,
  ): Promise<{ width: number; height: number; rgba: Uint8Array } | null>;
  requestPaint(): void;
  destroy(): void;
}

const WGSL = `
struct Cam {
  z: f32,
  x: f32,
  y: f32,
  dpr: f32,
  vw: f32,
  vh: f32,
}
struct Board {
  pos: vec2f,
  size: vec2f,
}
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> board: Board;
@group(0) @binding(3) var<uniform> cam: Cam;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var quad = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );
  let corner = quad[vi];
  let world = board.pos + corner * board.size;
  let screen = (world - vec2f(cam.x, cam.y)) * cam.z * cam.dpr;
  var out: VSOut;
  out.pos = vec4f(screen.x / cam.vw * 2.0 - 1.0, 1.0 - screen.y / cam.vh * 2.0, 0.0, 1.0);
  out.uv = corner;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`;

const SHADER_WGSL = `
struct Cam {
  z: f32,
  x: f32,
  y: f32,
  dpr: f32,
  vw: f32,
  vh: f32,
}
struct Quad {
  pos: vec2f,
  size: vec2f,
  radius: f32,
  pad0: f32,
  pad1: f32,
}
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> quad: Quad;
@group(0) @binding(3) var<uniform> cam: Cam;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );
  let corner = corners[vi];
  let world = quad.pos + corner * quad.size;
  let screen = (world - vec2f(cam.x, cam.y)) * cam.z * cam.dpr;
  var out: VSOut;
  out.pos = vec4f(screen.x / cam.vw * 2.0 - 1.0, 1.0 - screen.y / cam.vh * 2.0, 0.0, 1.0);
  out.uv = corner;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let halfSize = quad.size * 0.5;
  let local = in.uv * quad.size - halfSize;
  let radius = clamp(quad.radius, 0.0, min(halfSize.x, halfSize.y));
  let q = abs(local) - (halfSize - vec2f(radius));
  let edgeDistance = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
  if (edgeDistance > 0.0) {
    discard;
  }
  return textureSample(tex, samp, in.uv);
}
`;

interface HiResEntry {
  tex: GPUTexture;
  texW: number;
  texH: number;
  bind: GPUBindGroup;
  bytes: number;
  lastUsed: number;
}

interface Board {
  el: Element;
  x: number;
  y: number;
  w: number;
  h: number;
  ubo: GPUBuffer;
  baseTex: GPUTexture;
  baseTexW: number;
  baseTexH: number;
  baseBind: GPUBindGroup;
  tex: GPUTexture;
  texW: number;
  texH: number;
  bind: GPUBindGroup;
  hiRes: HiResEntry | null;
  desiredScale: number;
  pendingScale: number | null;
  pendingSince: number;
  verifyEntry: HiResEntry | null;
  baseReady: boolean;
  zoomCaptureAt: number | null;
  captureZoomPrev: string;
  suspended: boolean;
}

interface ShaderLayer {
  el: Element;
  x: number;
  y: number;
  w: number;
  h: number;
  rect: { x: number; y: number; w: number; h: number };
  radius: number;
  ubo: GPUBuffer;
  tex: GPUTexture;
  texW: number;
  texH: number;
  bind: GPUBindGroup;
}

interface FramePump {
  stalled: boolean;
  warned: boolean;
}

function nextFrame(pump: FramePump, timeoutMs: number): Promise<boolean> {
  if (pump.stalled) return Promise.resolve(false);
  const { promise, resolve } = Promise.withResolvers<boolean>();
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    pump.stalled = true;
    if (!pump.warned) {
      pump.warned = true;
      console.warn(
        `[webgpu] requestAnimationFrame did not fire within ${timeoutMs}ms; continuing initialization without frame pacing`,
      );
    }
    resolve(false);
  }, timeoutMs);
  requestAnimationFrame(() => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(true);
  });
  return promise;
}

async function waitFrames(
  n: number,
  pump: FramePump,
  timeoutMs: number,
): Promise<boolean> {
  let rendered = true;
  for (let k = 0; k < n; k += 1) {
    if (!(await nextFrame(pump, timeoutMs))) rendered = false;
  }
  return rendered;
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function waitForQueueCompletion(
  queue: GPUQueue,
  timeoutMs: number,
): Promise<boolean> {
  const submitted = queue.onSubmittedWorkDone;
  if (typeof submitted !== "function") {
    await delay(0);
    return true;
  }
  const { promise: timedOut, resolve: expire } =
    Promise.withResolvers<boolean>();
  const timer = setTimeout(() => expire(false), timeoutMs);
  try {
    const completed = await Promise.race([
      submitted.call(queue).then(
        () => true,
        () => false,
      ),
      timedOut,
    ]);
    await delay(0);
    return completed;
  } finally {
    clearTimeout(timer);
  }
}

export async function createCompositor(
  canvas: HTMLCanvasElement,
  opts: CompositorOptions = {},
): Promise<Compositor> {
  canvas.setAttribute("layoutsubtree", "");
  if (typeof navigator.gpu === "undefined")
    throw new Error("navigator.gpu unavailable");

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) throw new Error("requestAdapter returned null");
  const device = await adapter.requestDevice();
  const gpuErrors: string[] = [];
  device.addEventListener("uncapturederror", (e) => {
    gpuErrors.push(e.error.message);
    console.error(`[webgpu] ${e.error.message}`);
  });
  const uploadElementImage = resolveElementImageUpload(device.queue);
  const copyElementImage =
    typeof device.queue.copyElementImageToTexture === "function"
      ? device.queue.copyElementImageToTexture.bind(device.queue)
      : null;
  const captureElementImage =
    typeof canvas.captureElementImage === "function"
      ? canvas.captureElementImage.bind(canvas)
      : null;

  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("webgpu canvas context unavailable");
  const ctx: GPUCanvasContext = context;
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: canvasFormat, alphaMode: "opaque" });

  let cssW = canvas.clientWidth || 1;
  let cssH = canvas.clientHeight || 1;
  let dpr = globalThis.devicePixelRatio || 1;
  const frameWaitTimeoutMs = Math.max(1, opts.frameWaitTimeoutMs ?? 1000);
  const framePump: FramePump = { stalled: false, warned: false };

  const uploadFormat = await detectUploadFormat();

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });
  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format: canvasFormat }] },
    primitive: { topology: "triangle-list" },
  });
  const shaderModule = device.createShaderModule({ code: SHADER_WGSL });
  const shaderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: {
      module: shaderModule,
      entryPoint: "fs",
      targets: [
        {
          format: canvasFormat,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
  const camUbo = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camArr = new Float32Array(8);

  const queue = new UploadQueue();
  let boards: Board[] = [];
  let byEl = new Map<Element, Board>();
  let shaders: ShaderLayer[] = [];
  let shaderByEl = new Map<Element, ShaderLayer>();
  let shaderDpr = dpr;
  let cam: Camera = { x: 0, y: 0, z: 1 };
  let destroyed = false;
  let frameNo = 0;
  let rafId = 0;
  let lastT = 0;
  let fpsEma = 0;
  let geometryApiOk = true;
  let uploadsTotal = 0;
  let paintsTotal = 0;
  let hiResBytes = 0;
  let interactive = false;
  const maxTextureBytes = opts.maxTextureBytes ?? 512 * 1024 * 1024;
  const maxHiResPixels = 16 * 1024 * 1024;
  const minZoom = opts.minZoom ?? 0.05;
  const maxZoom = opts.maxZoom ?? 32;
  const clearColor = opts.clearColor ?? { r: 0.063, g: 0.063, b: 0.078, a: 1 };
  async function detectUploadFormat(): Promise<GPUTextureFormat> {
    const probe = document.createElement("canvas");
    probe.width = 8;
    probe.height = 8;
    probe.setAttribute("content", "drawable");
    probe.setAttribute("layoutsubtree", "");
    probe.style.cssText =
      "position:fixed;left:-64px;top:0;width:8px;height:8px";
    const inner = document.createElement("div");
    inner.setAttribute("drawable", "");
    inner.style.cssText = "width:8px;height:8px;background:#fff";
    probe.appendChild(inner);
    document.body.appendChild(probe);
    probe.getContext("2d");
    await waitFrames(3, framePump, frameWaitTimeoutMs);
    const failures: string[] = [];
    for (const format of ["rgba8unorm", "bgra8unorm"] as const) {
      gpuErrors.length = 0;
      const tex = device.createTexture({
        size: [8, 8],
        format,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      uploadElementImage(
        { source: inner },
        { texture: tex, size: { width: 8, height: 8 } },
      );
      device.queue.submit([]);
      await waitFrames(2, framePump, frameWaitTimeoutMs);
      const completed = await waitForQueueCompletion(
        device.queue,
        frameWaitTimeoutMs,
      );
      tex.destroy();
      if (gpuErrors.length === 0) {
        probe.remove();
        if (!completed) {
          console.warn(
            `[webgpu] GPU queue did not complete the upload-format probe within ${frameWaitTimeoutMs}ms; continuing`,
          );
        }
        return format;
      }
      failures.push(`${format}: ${gpuErrors.join("; ")}`);
    }
    probe.remove();
    throw new Error(
      `drawElementImageToTexture failed on all formats${framePump.stalled ? " (animation frames stalled during probe)" : ""}: ${failures.join(" | ")}`,
    );
  }

  function bindEntriesFor(
    board: Board,
    texture: GPUTexture,
    cameraBuffer: GPUBuffer,
  ): GPUBindGroupEntry[] {
    return [
      { binding: 0, resource: sampler },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: { buffer: board.ubo } },
      { binding: 3, resource: { buffer: cameraBuffer } },
    ];
  }

  function bindFor(board: Board, texture: GPUTexture): GPUBindGroup {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: bindEntriesFor(board, texture, camUbo),
    });
  }

  function createBoardTexture(width: number, height: number): GPUTexture {
    return device.createTexture({
      size: [width, height],
      format: uploadFormat,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  function createShaderTexture(width: number, height: number): GPUTexture {
    return device.createTexture({
      size: [width, height],
      format: uploadFormat,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  function shaderBindFor(
    layer: ShaderLayer,
    texture: GPUTexture,
  ): GPUBindGroup {
    return device.createBindGroup({
      layout: shaderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: { buffer: layer.ubo } },
        { binding: 3, resource: { buffer: camUbo } },
      ],
    });
  }

  function uploadShader(layer: ShaderLayer): void {
    if (layer.el.parentElement !== canvas) return;
    try {
      uploadElementImage(
        { source: layer.el },
        { texture: layer.tex, size: { width: layer.texW, height: layer.texH } },
      );
    } catch {
      return;
    }
    uploadsTotal += 1;
  }

  function disposeShaderResources(): void {
    for (const layer of shaders) {
      layer.tex.destroy();
      layer.ubo.destroy();
    }
    shaders = [];
    shaderByEl = new Map();
  }

  function setShaders(inits: ShaderInit[]): void {
    if (destroyed) return;
    disposeShaderResources();
    const maxDim = device.limits.maxTextureDimension2D;
    for (const init of inits) {
      const size = shaderTextureSize(init.worldW, init.worldH, dpr, maxDim);
      const tex = createShaderTexture(size.width, size.height);
      const ubo = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        ubo,
        0,
        new Float32Array([
          init.worldX,
          init.worldY,
          init.worldW,
          init.worldH,
          Math.max(0, init.radius ?? 0),
          0,
          0,
          0,
        ]),
      );
      const layer: ShaderLayer = {
        el: init.el,
        x: init.worldX,
        y: init.worldY,
        w: init.worldW,
        h: init.worldH,
        rect: {
          x: init.worldX,
          y: init.worldY,
          w: init.worldW,
          h: init.worldH,
        },
        radius: Math.max(0, init.radius ?? 0),
        ubo,
        tex,
        texW: size.width,
        texH: size.height,
        bind: null as unknown as GPUBindGroup,
      };
      layer.bind = shaderBindFor(layer, tex);
      shaders.push(layer);
      shaderByEl.set(init.el, layer);
      uploadShader(layer);
    }
    shaderDpr = dpr;
    canvas.requestPaint();
  }

  function resizeShaderTextures(): void {
    const maxDim = device.limits.maxTextureDimension2D;
    for (const layer of shaders) {
      const size = shaderTextureSize(layer.w, layer.h, dpr, maxDim);
      if (size.width === layer.texW && size.height === layer.texH) continue;
      layer.tex.destroy();
      layer.tex = createShaderTexture(size.width, size.height);
      layer.texW = size.width;
      layer.texH = size.height;
      layer.bind = shaderBindFor(layer, layer.tex);
      uploadShader(layer);
    }
  }

  function restoreBase(b: Board): void {
    if (!b.hiRes) return;
    b.hiRes.tex.destroy();
    hiResBytes -= b.hiRes.bytes;
    b.hiRes = null;
    b.tex = b.baseTex;
    b.texW = b.baseTexW;
    b.texH = b.baseTexH;
    b.bind = b.baseBind;
    if (!b.baseReady) queue.markDirty(b.el);
  }

  function targetTextureSize(
    b: Board,
    scale: number,
  ): { width: number; height: number } {
    return fitTextureSize(
      b.w,
      b.h,
      scale,
      device.limits.maxTextureDimension2D,
      maxHiResPixels,
    );
  }

  function scheduleScale(b: Board): void {
    if (interactive) return;
    const scale = b.desiredScale;
    const size = targetTextureSize(b, scale);
    if (scale <= 1 || (size.width <= b.baseTexW && size.height <= b.baseTexH)) {
      b.pendingScale = null;
      restoreBase(b);
      return;
    }
    if (
      b.hiRes &&
      b.hiRes.texW === size.width &&
      b.hiRes.texH === size.height
    ) {
      b.hiRes.lastUsed = frameNo;
      b.pendingScale = null;
      return;
    }
    b.pendingScale = scale;
    b.pendingSince = frameNo;
    canvas.requestPaint();
  }

  function applyPendingScale(b: Board): void {
    const scale = b.pendingScale;
    if (scale === null) return;
    if (b.el.parentElement !== canvas) {
      b.pendingScale = null;
      releaseCaptureZoom(b);
      return;
    }
    const size = targetTextureSize(b, scale);
    if (size.width <= b.baseTexW && size.height <= b.baseTexH) {
      b.pendingScale = null;
      releaseCaptureZoom(b);
      restoreBase(b);
      return;
    }
    if (!b.baseReady) {
      uploadElementImage(
        { source: b.el },
        { texture: b.baseTex, size: { width: b.baseTexW, height: b.baseTexH } },
      );
      b.baseReady = true;
    }
    if (b.zoomCaptureAt !== null) {
      if (frameNo <= b.zoomCaptureAt) return;
      b.pendingScale = null;
      if (!finishZoomCapture(b)) captureBoardImage(b, size);
      if (b.desiredScale !== scale) scheduleScale(b);
      return;
    }
    if (canCaptureAtZoom(b, size)) {
      beginCaptureZoom(b, size);
      return;
    }
    b.pendingScale = null;
    captureBoardImage(b, size);
    if (b.desiredScale !== scale) scheduleScale(b);
  }

  function canCaptureAtZoom(
    b: Board,
    size: { width: number; height: number },
  ): boolean {
    if (!captureElementImage || !copyElementImage) return false;
    if (!(b.el instanceof HTMLElement)) return false;
    return size.width / Math.max(1, b.baseTexW) > 1.02;
  }

  function beginCaptureZoom(
    b: Board,
    size: { width: number; height: number },
  ): void {
    const el = b.el as HTMLElement;
    b.captureZoomPrev = el.style.zoom;
    el.style.zoom = String(size.width / Math.max(1, b.baseTexW));
    b.zoomCaptureAt = frameNo;
  }

  function releaseCaptureZoom(b: Board): void {
    if (b.zoomCaptureAt === null) return;
    if (b.el instanceof HTMLElement) b.el.style.zoom = b.captureZoomPrev;
    b.zoomCaptureAt = null;
  }

  function finishZoomCapture(b: Board): boolean {
    if (b.zoomCaptureAt === null) return false;
    let image: ElementImage | null = null;
    try {
      if (b.el.parentElement !== canvas) {
        releaseCaptureZoom(b);
        return false;
      }
      image = captureElementImage?.(b.el) ?? null;
    } catch {
      image = null;
    } finally {
      releaseCaptureZoom(b);
    }
    if (!image || image.width < 1 || image.height < 1) {
      image?.close?.();
      return false;
    }
    const width = Math.round(image.width);
    const height = Math.round(image.height);
    if (!b.baseReady) {
      uploadElementImage(
        { source: b.el },
        { texture: b.baseTex, size: { width: b.baseTexW, height: b.baseTexH } },
      );
      b.baseReady = true;
    }
    if (b.hiRes) restoreBase(b);
    const tex = createBoardTexture(width, height);
    try {
      copyElementImage?.({ source: image }, { destination: { texture: tex } });
    } catch {
      tex.destroy();
      image.close?.();
      return false;
    }
    image.close?.();
    installHiRes(b, tex, width, height);
    return true;
  }

  function captureBoardImage(
    b: Board,
    size: { width: number; height: number },
  ): void {
    if (b.hiRes) restoreBase(b);
    const tex = createBoardTexture(size.width, size.height);
    try {
      uploadElementImage(
        { source: b.el },
        { texture: tex, size: { width: size.width, height: size.height } },
      );
    } catch {
      tex.destroy();
      return;
    }
    installHiRes(b, tex, size.width, size.height);
  }

  function installHiRes(
    b: Board,
    tex: GPUTexture,
    width: number,
    height: number,
  ): void {
    const bytes = width * height * 4;
    const bind = bindFor(b, tex);
    const entry: HiResEntry = {
      tex,
      texW: width,
      texH: height,
      bind,
      bytes,
      lastUsed: frameNo,
    };
    b.hiRes = entry;
    b.tex = tex;
    b.texW = width;
    b.texH = height;
    b.bind = bind;
    b.verifyEntry = entry;
    hiResBytes += bytes;
    opts.onBoardUploaded?.(b.el);
    while (hiResBytes > maxTextureBytes) {
      let oldest: Board | null = null;
      for (const other of boards) {
        if (!other.hiRes) continue;
        if (
          !oldest ||
          (other.hiRes?.lastUsed ?? 0) < (oldest.hiRes?.lastUsed ?? 0)
        )
          oldest = other;
      }
      if (!oldest) break;
      if (oldest === b) break;
      restoreBase(oldest);
    }
  }

  function verifyPendingUploads(): void {
    for (const b of boards) {
      const entry = b.verifyEntry;
      if (!entry || b.tex !== entry.tex) continue;
      b.verifyEntry = null;
      void verifyHiRes(b, entry);
    }
  }

  async function verifyHiRes(b: Board, entry: HiResEntry): Promise<void> {
    const alpha = await readTextureAlpha(entry.tex);
    if (destroyed || b.hiRes !== entry) return;
    if (alpha > 0) return;
    restoreBase(b);
    queue.markDirty(b.el);
    canvas.requestPaint();
  }

  async function readTextureAlpha(tex: GPUTexture): Promise<number> {
    const width = Math.min(16, tex.width);
    const height = Math.min(16, tex.height);
    const origin = {
      x: Math.max(0, Math.floor((tex.width - width) / 2)),
      y: Math.max(0, Math.floor((tex.height - height) / 2)),
    };
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buffer = device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: tex, origin },
        { buffer, bytesPerRow },
        { width, height },
      );
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buffer.getMappedRange());
      let max = 0;
      for (let i = 3; i < src.length; i += 4) {
        const a = src[i] ?? 0;
        if (a > max) max = a;
      }
      buffer.unmap();
      return max;
    } catch {
      return 255;
    } finally {
      buffer.destroy();
    }
  }

  function disposeBoardResources(): void {
    for (const b of boards) {
      releaseCaptureZoom(b);
      b.baseTex.destroy();
      b.ubo.destroy();
      if (b.hiRes) {
        b.hiRes.tex.destroy();
        hiResBytes -= b.hiRes.bytes;
        b.hiRes = null;
      }
    }
    boards = [];
    byEl = new Map();
  }
  function setBoards(inits: BoardInit[]): void {
    disposeBoardResources();
    const maxDim = device.limits.maxTextureDimension2D;
    for (const init of inits) {
      const texW = Math.min(Math.max(1, Math.round(init.worldW * dpr)), maxDim);
      const texH = Math.min(Math.max(1, Math.round(init.worldH * dpr)), maxDim);
      const tex = createBoardTexture(texW, texH);
      const ubo = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        ubo,
        0,
        new Float32Array([init.worldX, init.worldY, init.worldW, init.worldH]),
      );
      const board: Board = {
        el: init.el,
        x: init.worldX,
        y: init.worldY,
        w: init.worldW,
        h: init.worldH,
        ubo,
        baseTex: tex,
        baseTexW: texW,
        baseTexH: texH,
        baseBind: null as unknown as GPUBindGroup,
        tex,
        texW,
        texH,
        bind: null as unknown as GPUBindGroup,
        hiRes: null,
        desiredScale: 1,
        pendingScale: null,
        pendingSince: 0,
        verifyEntry: null,
        baseReady: false,
        zoomCaptureAt: null,
        captureZoomPrev: "",
        suspended: false,
      };
      board.baseBind = bindFor(board, tex);
      board.bind = board.baseBind;
      boards.push(board);
      byEl.set(init.el, board);
    }
    for (const b of boards) {
      queue.markDirty(b.el);
    }
    canvas.requestPaint();
  }

  function uploadEl(el: Element): void {
    const b = byEl.get(el);
    if (b) {
      if (b.suspended || el.parentElement !== canvas) return;
      try {
        uploadElementImage(
          { source: el },
          { texture: b.tex, size: { width: b.texW, height: b.texH } },
        );
      } catch {
        return;
      }
      if (b.tex === b.baseTex) b.baseReady = true;
      uploadsTotal += 1;
      opts.onBoardUploaded?.(el);
      return;
    }
    const layer = shaderByEl.get(el);
    if (layer) uploadShader(layer);
  }

  function flushUploads(): void {
    if (queue.size === 0) return;
    const t0 = performance.now();
    const els = queue.takeAll();
    for (const el of els) uploadEl(el);
    if (!queue.isInitialDone) {
      const ms = performance.now() - t0;
      queue.completeInitial(ms);
      opts.onInitialUpload?.(ms, els.length);
    }
  }

  function onPaint(e: Event): void {
    const paint = e as PaintEvent;
    paintsTotal += 1;
    for (const el of paint.changedElements) queue.markDirty(el);
  }
  canvas.addEventListener("paint", onPaint);

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    if (
      entry.devicePixelContentBoxSize &&
      entry.devicePixelContentBoxSize.length > 0
    ) {
      const size = entry.devicePixelContentBoxSize[0];
      if (!size) return;
      canvas.width = size.inlineSize;
      canvas.height = size.blockSize;
      dpr = canvas.width / Math.max(1, entry.contentRect.width);
    } else {
      dpr = globalThis.devicePixelRatio || 1;
      canvas.width = Math.round(entry.contentRect.width * dpr);
      canvas.height = Math.round(entry.contentRect.height * dpr);
    }
    cssW = entry.contentRect.width || cssW;
    cssH = entry.contentRect.height || cssH;
  });
  observer.observe(canvas, { box: "device-pixel-content-box" });

  function frame(t: number): void {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);
    frameNo += 1;
    if (lastT > 0) {
      const dt = t - lastT;
      if (dt > 0 && dt < 500) {
        fpsEma = fpsEma === 0 ? 1000 / dt : fpsEma * 0.93 + (1000 / dt) * 0.07;
      }
    }
    lastT = t;

    for (const b of boards) {
      if (b.suspended || b.pendingScale === null || interactive) continue;
      if (frameNo <= b.pendingSince) continue;
      applyPendingScale(b);
    }

    if (shaderDpr !== dpr) {
      shaderDpr = dpr;
      resizeShaderTextures();
    }

    flushUploads();

    verifyPendingUploads();

    camArr[0] = cam.z;
    camArr[1] = cam.x;
    camArr[2] = cam.y;
    camArr[3] = dpr;
    camArr[4] = canvas.width;
    camArr[5] = canvas.height;
    device.queue.writeBuffer(camUbo, 0, camArr);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: clearColor,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    const view = visibleRect(cam, cssW, cssH);
    let visible = 0;
    for (const b of boards) {
      if (b.suspended) continue;
      if (!intersects({ x: b.x, y: b.y, w: b.w, h: b.h }, view)) continue;
      if (b.hiRes) b.hiRes.lastUsed = frameNo;
      pass.setBindGroup(0, b.bind);
      pass.draw(6);
      visible += 1;
    }
    pass.setPipeline(shaderPipeline);
    for (const layer of shaders) {
      if (!intersects(layer.rect, view)) continue;
      pass.setBindGroup(0, layer.bind);
      pass.draw(6);
      visible += 1;
    }
    pass.end();
    device.queue.submit([encoder.finish()]);

    if (geometryApiOk) {
      try {
        const mtx = new DOMMatrix();
        for (const b of boards) {
          if (b.suspended) continue;
          const sx = (b.x - cam.x) * cam.z;
          const sy = (b.y - cam.y) * cam.z;
          if (
            sx >= cssW ||
            sy >= cssH ||
            sx + b.w * cam.z <= 0 ||
            sy + b.h * cam.z <= 0
          )
            continue;
          mtx.a = cam.z;
          mtx.d = cam.z;
          mtx.e = sx;
          mtx.f = sy;
          canvas.updateElementGeometry(b.el, { canvasTransform: mtx });
        }
        try {
          for (const layer of shaders) {
            const sx = (layer.x - cam.x) * cam.z;
            const sy = (layer.y - cam.y) * cam.z;
            if (
              sx >= cssW ||
              sy >= cssH ||
              sx + layer.w * cam.z <= 0 ||
              sy + layer.h * cam.z <= 0
            )
              continue;
            mtx.a = cam.z;
            mtx.d = cam.z;
            mtx.e = sx;
            mtx.f = sy;
            canvas.updateElementGeometry(layer.el, { canvasTransform: mtx });
          }
        } catch {}
        geometryApiOk = true;
      } catch {
        geometryApiOk = false;
      }
    }

    opts.onStats?.({
      fps: Math.round(fpsEma),
      visible,
      uploads: uploadsTotal,
      paints: paintsTotal,
    });
  }
  rafId = requestAnimationFrame(frame);

  function uploadAtScale(el: Element, scale: number): boolean {
    const b = byEl.get(el);
    if (!b || destroyed || el.parentElement !== canvas) return false;
    if (
      !uploadElementImage.canResample &&
      !(captureElementImage && copyElementImage)
    )
      return false;
    b.desiredScale = Math.max(1, scale);
    scheduleScale(b);
    return true;
  }

  function setInteractive(active: boolean): void {
    if (destroyed || interactive === active) return;
    interactive = active;
    for (const b of boards) {
      if (b.suspended) continue;
      b.pendingScale = null;
      releaseCaptureZoom(b);
      if (active) restoreBase(b);
    }
    if (active) return;
    for (const b of boards) scheduleScale(b);
    canvas.requestPaint();
  }

  function suspendBoard(el: Element): void {
    const b = byEl.get(el);
    if (!b || destroyed) return;
    b.suspended = true;
    b.pendingScale = null;
    releaseCaptureZoom(b);
    restoreBase(b);
  }

  function resumeBoard(el: Element): void {
    const b = byEl.get(el);
    if (!b || destroyed) return;
    b.suspended = false;
    scheduleScale(b);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (destroyed || b.suspended) return;
        queue.markDirty(el);
        canvas.requestPaint();
      });
    });
  }
  async function exportBoard(
    el: Element,
    scale: number,
  ): Promise<{ width: number; height: number; rgba: Uint8Array } | null> {
    const b = byEl.get(el);
    if (!b || destroyed) return null;
    flushUploads();
    uploadEl(el);
    const boardRect = { x: b.x, y: b.y, w: b.w, h: b.h };
    const overlapping = shaders.filter((layer) =>
      intersects(layer.rect, boardRect),
    );
    for (const layer of overlapping) uploadShader(layer);
    const maxDim = device.limits.maxTextureDimension2D;
    const outW = Math.min(Math.max(1, Math.round(b.w * scale)), maxDim);
    const outH = Math.min(Math.max(1, Math.round(b.h * scale)), maxDim);
    const target = device.createTexture({
      size: { width: outW, height: outH },
      format: canvasFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const camArr = new Float32Array(6);
    camArr[0] = outW / b.w;
    camArr[1] = b.x;
    camArr[2] = b.y;
    camArr[3] = 1;
    camArr[4] = outW;
    camArr[5] = outH;
    device.queue.writeBuffer(camUbo, 0, camArr);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: clearColor,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, b.baseBind);
    pass.draw(6);
    pass.setPipeline(shaderPipeline);
    for (const layer of overlapping) {
      pass.setBindGroup(0, layer.bind);
      pass.draw(6);
    }
    pass.end();
    const bytesPerRow = Math.ceil((outW * 4) / 256) * 256;
    const buffer = device.createBuffer({
      size: bytesPerRow * outH,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyTextureToBuffer(
      { texture: target },
      { buffer, bytesPerRow },
      { width: outW, height: outH },
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buffer.getMappedRange());
    const rgba = new Uint8Array(outW * outH * 4);
    for (let y = 0; y < outH; y += 1) {
      rgba.set(
        src.subarray(y * bytesPerRow, y * bytesPerRow + outW * 4),
        y * outW * 4,
      );
    }
    buffer.unmap();
    buffer.destroy();
    target.destroy();
    if (canvasFormat === "bgra8unorm") {
      for (let i = 0; i < rgba.length; i += 4) {
        const b0 = rgba[i] ?? 0;
        rgba[i] = rgba[i + 2] ?? 0;
        rgba[i + 2] = b0;
      }
    }
    return { width: outW, height: outH, rgba };
  }

  const camera: CameraHandle = {
    set(next: Camera) {
      cam = { x: next.x, y: next.y, z: next.z };
    },
    get(): Camera {
      return { x: cam.x, y: cam.y, z: cam.z };
    },
    zoomAt(factor: number, cx: number, cy: number): Camera {
      cam = cameraZoomAt(cam, factor, cx, cy, minZoom, maxZoom);
      return camera.get();
    },
    centerOn(
      wx: number,
      wy: number,
      viewportW: number,
      viewportH: number,
    ): Camera {
      cam = {
        x: wx - viewportW / 2 / cam.z,
        y: wy - viewportH / 2 / cam.z,
        z: cam.z,
      };
      return camera.get();
    },
  };

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(rafId);
    observer.disconnect();
    canvas.removeEventListener("paint", onPaint);
    disposeBoardResources();
    disposeShaderResources();
    camUbo.destroy();
    device.destroy();
  }

  return {
    canvas,
    camera,
    setBoards,
    setShaders,
    flushUploads,
    uploadAtScale,
    setInteractive,
    suspendBoard,
    resumeBoard,
    exportBoard,
    requestPaint() {
      canvas.requestPaint();
    },
    destroy,
  };
}
