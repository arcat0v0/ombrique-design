import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCompositor, type Compositor } from "./compositor";

interface FakeTexture {
  id: number;
  width: number;
  height: number;
  format: string;
  destroyed: boolean;
  createView(): FakeTextureView;
  destroy(): void;
}

interface FakeTextureView {
  texture: FakeTexture;
}

interface FakeBuffer {
  id: number;
  size: number;
  data: Uint8Array;
  destroyed: boolean;
  mapAsync(): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface FakeBindGroup {
  pipeline: string;
  entries: Array<{ binding: number; resource: unknown }>;
}

interface FakePass {
  pipeline: string;
  draws: FakeBindGroup[];
}

interface FakeUpload {
  element: Element;
  texture: FakeTexture;
}

interface FakePipeline {
  name: string;
  descriptor: {
    fragment?: {
      targets?: Array<{
        format?: string;
        blend?: {
          color?: Record<string, string>;
          alpha?: Record<string, string>;
        };
      }>;
    };
  };
}

interface FakeGpuHarness {
  device: GPUDevice;
  canvasContext: GPUCanvasContext;
  textures: FakeTexture[];
  buffers: FakeBuffer[];
  uploads: FakeUpload[];
  passes: FakePass[];
  bindGroups: FakeBindGroup[];
  pipelines: FakePipeline[];
  pendingPass(): FakePass | null;
}

function createFakeGpu(failFormats: readonly string[] = []): FakeGpuHarness {
  const textures: FakeTexture[] = [];
  const buffers: FakeBuffer[] = [];
  const uploads: FakeUpload[] = [];
  const passes: FakePass[] = [];
  const bindGroups: FakeBindGroup[] = [];
  const pipelines: FakePipeline[] = [];
  const errorListeners = new Set<(event: unknown) => void>();
  let pipelineIndex = 0;
  let currentPass: FakePass | null = null;

  const queue = {
    writeBuffer: () => {},
    submit: () => {},
    onSubmittedWorkDone: async () => {},
    drawElementImageToTexture: (
      source: { source: Element },
      destination: { texture: FakeTexture },
    ) => {
      uploads.push({ element: source.source, texture: destination.texture });
      if (!failFormats.includes(destination.texture.format)) return;
      for (const listener of errorListeners)
        listener({
          error: { message: `${destination.texture.format} is unsupported` },
        });
    },
  };

  const device = {
    limits: { maxTextureDimension2D: 8192 },
    queue,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      if (type === "uncapturederror") errorListeners.add(listener);
    },
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createRenderPipeline: (descriptor: FakePipeline["descriptor"]) => {
      pipelineIndex += 1;
      const name = pipelineIndex === 1 ? "board" : "shader";
      pipelines.push({ name, descriptor });
      return {
        name,
        getBindGroupLayout: () => ({ pipeline: name }),
      };
    },
    createTexture: (descriptor: {
      size: number[] | { width: number; height: number };
      format?: string;
    }) => {
      const width = Array.isArray(descriptor.size)
        ? (descriptor.size[0] ?? 1)
        : descriptor.size.width;
      const height = Array.isArray(descriptor.size)
        ? (descriptor.size[1] ?? 1)
        : descriptor.size.height;
      const texture: FakeTexture = {
        id: textures.length + 1,
        width,
        height,
        format: descriptor.format ?? "",
        destroyed: false,
        createView() {
          return { texture };
        },
        destroy() {
          texture.destroyed = true;
        },
      };
      textures.push(texture);
      return texture;
    },
    createBuffer: (descriptor: { size: number }) => {
      const buffer: FakeBuffer = {
        id: buffers.length + 1,
        size: descriptor.size,
        data: new Uint8Array(descriptor.size),
        destroyed: false,
        mapAsync: async () => {},
        getMappedRange() {
          return buffer.data.buffer as ArrayBuffer;
        },
        unmap: () => {},
        destroy() {
          buffer.destroyed = true;
        },
      };
      buffers.push(buffer);
      return buffer;
    },
    createBindGroup: (descriptor: {
      layout: { pipeline: string };
      entries: Array<{ binding: number; resource: unknown }>;
    }) => {
      const group: FakeBindGroup = {
        pipeline: descriptor.layout.pipeline,
        entries: descriptor.entries,
      };
      bindGroups.push(group);
      return group;
    },
    createCommandEncoder: () => ({
      beginRenderPass: () => {
        const pass: FakePass = { pipeline: "", draws: [] };
        currentPass = pass;
        passes.push(pass);
        return {
          setPipeline: (target: { name: string }) => {
            pass.pipeline = target.name;
          },
          setBindGroup: (_index: number, group: FakeBindGroup) => {
            pass.draws.push(group);
          },
          draw: () => {},
          end: () => {
            currentPass = null;
          },
        };
      },
      copyTextureToBuffer: () => {},
      finish: () => {
        currentPass = null;
        return {};
      },
    }),
    destroy: () => {},
  };

  const canvasContext = {
    configure: () => {},
    getCurrentTexture: () =>
      device.createTexture({ size: { width: 1, height: 1 } }),
  };

  return {
    device: device as unknown as GPUDevice,
    canvasContext: canvasContext as unknown as GPUCanvasContext,
    textures,
    buffers,
    uploads,
    passes,
    bindGroups,
    pipelines,
    pendingPass: () => currentPass,
  };
}

interface Harness {
  compositor: Compositor;
  gpu: FakeGpuHarness;
  host: HTMLCanvasElement;
}

let harness: Harness | null = null;

function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => resolve());
  return promise;
}

async function frames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await nextFrame();
}

interface SetupOptions {
  frameWaitTimeoutMs?: number;
  failFormats?: string[];
}

async function setup(dpr = 1, options: SetupOptions = {}): Promise<Harness> {
  const gpu = createFakeGpu(options.failFormats);
  const host = document.createElement("canvas");
  Object.defineProperty(host, "clientWidth", { value: 800 });
  Object.defineProperty(host, "clientHeight", { value: 600 });
  Object.defineProperty(host, "getContext", {
    value: (type: string) => (type === "webgpu" ? gpu.canvasContext : null),
  });
  host.requestPaint = () => {};
  document.body.appendChild(host);
  const navigatorValue = navigator as unknown as { gpu?: unknown };
  navigatorValue.gpu = {
    requestAdapter: async () => ({ requestDevice: async () => gpu.device }),
    getPreferredCanvasFormat: () => "rgba8unorm",
  };
  Object.defineProperty(globalThis, "devicePixelRatio", {
    configurable: true,
    value: dpr,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    },
  );
  vi.stubGlobal("GPUTextureUsage", {
    TEXTURE_BINDING: 1,
    COPY_DST: 2,
    COPY_SRC: 4,
    RENDER_ATTACHMENT: 8,
  });
  vi.stubGlobal("GPUBufferUsage", {
    UNIFORM: 1,
    COPY_DST: 2,
    MAP_READ: 4,
  });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const compositor = await createCompositor(host, {
    frameWaitTimeoutMs: options.frameWaitTimeoutMs,
  });
  const result: Harness = { compositor, gpu, host };
  harness = result;
  return result;
}

function appendDrawable(
  host: HTMLCanvasElement,
  className: string,
): HTMLElement {
  const element = document.createElement("section");
  element.className = className;
  element.setAttribute("drawable", "");
  host.appendChild(element);
  return element;
}

function appendShaderCanvas(host: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("drawable", "");
  host.appendChild(canvas);
  return canvas;
}

function dispatchPaint(host: HTMLCanvasElement, elements: Element[]): void {
  const event = new Event("paint");
  Object.assign(event, { changedElements: elements });
  host.dispatchEvent(event);
}

function textureOf(group: FakeBindGroup): FakeTexture | undefined {
  const entry = group.entries.find((candidate) => candidate.binding === 1);
  const view = entry?.resource as FakeTextureView | undefined;
  return view?.texture;
}

function elementOf(
  gpu: FakeGpuHarness,
  texture: FakeTexture,
): Element | undefined {
  return gpu.uploads.find((upload) => upload.texture === texture)?.element;
}

function uploadCount(gpu: FakeGpuHarness, element: Element): number {
  return gpu.uploads.filter((upload) => upload.element === element).length;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  harness?.compositor.destroy();
  harness = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "devicePixelRatio");
  const navigatorValue = navigator as unknown as { gpu?: unknown };
  Reflect.deleteProperty(navigatorValue, "gpu");
});

describe("shader compositing", () => {
  it("uploads a shader into its own texture without re-uploading the board", async () => {
    const { compositor, gpu, host } = await setup();
    const board = appendDrawable(host, "board");
    const shader = appendShaderCanvas(host);
    compositor.setBoards([
      { el: board, worldX: 0, worldY: 0, worldW: 400, worldH: 300 },
    ]);
    compositor.setShaders([
      {
        el: shader,
        worldX: 100,
        worldY: 60,
        worldW: 200,
        worldH: 120,
        radius: 8,
      },
    ]);
    await frames(2);
    const boardUploads = uploadCount(gpu, board);
    expect(boardUploads).toBeGreaterThanOrEqual(1);
    expect(uploadCount(gpu, shader)).toBeGreaterThanOrEqual(1);
    const shaderUpload = gpu.uploads.find(
      (upload) => upload.element === shader,
    );
    expect(shaderUpload?.texture.width).toBe(200);
    expect(shaderUpload?.texture.height).toBe(120);

    const shaderUploads = uploadCount(gpu, shader);
    dispatchPaint(host, [shader]);
    compositor.flushUploads();
    expect(uploadCount(gpu, shader)).toBe(shaderUploads + 1);
    expect(uploadCount(gpu, board)).toBe(boardUploads);
  });

  it("draws boards first and shader layers above them", async () => {
    const { compositor, gpu, host } = await setup();
    const board = appendDrawable(host, "board");
    const shader = appendShaderCanvas(host);
    compositor.setBoards([
      { el: board, worldX: 0, worldY: 0, worldW: 400, worldH: 300 },
    ]);
    compositor.setShaders([
      {
        el: shader,
        worldX: 10,
        worldY: 20,
        worldW: 100,
        worldH: 80,
      },
    ]);
    await frames(2);
    const pass = gpu.passes.at(-1);
    expect(pass).toBeDefined();
    expect(pass?.draws).toHaveLength(2);
    const [boardGroup, shaderGroup] = pass?.draws ?? [];
    if (!boardGroup || !shaderGroup) throw new Error("missing draws");
    expect(boardGroup.pipeline).toBe("board");
    expect(shaderGroup.pipeline).toBe("shader");
    const boardTexture = textureOf(boardGroup);
    const shaderTexture = textureOf(shaderGroup);
    if (!boardTexture || !shaderTexture) throw new Error("missing textures");
    expect(elementOf(gpu, boardTexture)).toBe(board);
    expect(elementOf(gpu, shaderTexture)).toBe(shader);
  });

  it("culls shader quads outside the visible world rect", async () => {
    const { compositor, gpu, host } = await setup();
    const board = appendDrawable(host, "board");
    const shader = appendShaderCanvas(host);
    compositor.setBoards([
      { el: board, worldX: 0, worldY: 0, worldW: 400, worldH: 300 },
    ]);
    compositor.setShaders([
      {
        el: shader,
        worldX: 5000,
        worldY: 5000,
        worldW: 100,
        worldH: 80,
      },
    ]);
    await frames(2);
    const pass = gpu.passes.at(-1);
    expect(pass?.draws).toHaveLength(1);
    expect(pass?.draws[0]?.pipeline).toBe("board");
  });

  it("composites overlapping shader layers into board exports", async () => {
    const { compositor, gpu, host } = await setup();
    const board = appendDrawable(host, "board");
    const inside = appendShaderCanvas(host);
    const outside = appendShaderCanvas(host);
    compositor.setBoards([
      { el: board, worldX: 0, worldY: 0, worldW: 400, worldH: 300 },
    ]);
    compositor.setShaders([
      { el: inside, worldX: 20, worldY: 30, worldW: 100, worldH: 80 },
      { el: outside, worldX: 5000, worldY: 0, worldW: 100, worldH: 80 },
    ]);
    await frames(2);
    const before = gpu.passes.length;
    const result = await compositor.exportBoard(board, 2);
    expect(result?.width).toBe(800);
    expect(result?.height).toBe(600);
    expect(result?.rgba.length).toBe(800 * 600 * 4);
    const exportPass = gpu.passes[before];
    expect(exportPass?.draws.map((group) => group.pipeline)).toEqual([
      "board",
      "shader",
    ]);
    const shaderTexture = textureOf(exportPass?.draws[1] as FakeBindGroup);
    if (!shaderTexture) throw new Error("missing shader texture");
    expect(elementOf(gpu, shaderTexture)).toBe(inside);
    expect(uploadCount(gpu, inside)).toBeGreaterThanOrEqual(1);
  });

  it("sizes shader textures with the device pixel ratio", async () => {
    const { compositor, gpu, host } = await setup(2);
    const board = appendDrawable(host, "board");
    const shader = appendShaderCanvas(host);
    compositor.setBoards([
      { el: board, worldX: 0, worldY: 0, worldW: 210, worldH: 150 },
    ]);
    compositor.setShaders([
      { el: shader, worldX: 0, worldY: 0, worldW: 210, worldH: 150 },
    ]);
    const upload = gpu.uploads.find((entry) => entry.element === shader);
    expect(upload?.texture.width).toBe(420);
    expect(upload?.texture.height).toBe(300);
  });

  it("releases shader resources on replacement and destroy", async () => {
    const { compositor, gpu, host } = await setup();
    const board = appendDrawable(host, "board");
    const shader = appendShaderCanvas(host);
    compositor.setBoards([
      { el: board, worldX: 0, worldY: 0, worldW: 400, worldH: 300 },
    ]);
    await frames(2);
    compositor.setShaders([
      { el: shader, worldX: 0, worldY: 0, worldW: 100, worldH: 80 },
    ]);
    const shaderUpload = gpu.uploads.find((entry) => entry.element === shader);
    if (!shaderUpload) throw new Error("missing shader upload");
    const shaderTexture = shaderUpload.texture;
    const boardUpload = gpu.uploads.find((entry) => entry.element === board);
    const boardTexture = boardUpload?.texture;
    compositor.setShaders([]);
    expect(shaderTexture.destroyed).toBe(true);
    expect(boardTexture?.destroyed).toBe(false);

    compositor.setShaders([
      { el: shader, worldX: 0, worldY: 0, worldW: 100, worldH: 80 },
    ]);
    const secondUpload = gpu.uploads.filter(
      (entry) => entry.element === shader,
    )[1];
    if (!secondUpload) throw new Error("missing second shader upload");
    compositor.destroy();
    expect(secondUpload.texture.destroyed).toBe(true);
    expect(boardTexture?.destroyed).toBe(true);
    harness = null;
  });
});

describe("initialization without animation frames", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("requestAnimationFrame", () => 0);
  });

  it("completes upload-format detection and uses the supported format", async () => {
    const { compositor, gpu, host } = await setup(1, {
      frameWaitTimeoutMs: 5,
      failFormats: ["rgba8unorm"],
    });
    const board = appendDrawable(host, "board");
    compositor.setBoards([
      { el: board, worldX: 0, worldY: 0, worldW: 400, worldH: 300 },
    ]);
    const boardTexture = gpu.textures.find(
      (texture) => texture.width === 400 && texture.height === 300,
    );
    expect(boardTexture?.format).toBe("bgra8unorm");
  });

  it("still rejects when every upload format reports a GPU error", async () => {
    await expect(
      setup(1, {
        frameWaitTimeoutMs: 5,
        failFormats: ["rgba8unorm", "bgra8unorm"],
      }),
    ).rejects.toThrow(
      /rgba8unorm: .*unsupported.* \| bgra8unorm: .*unsupported/,
    );
  });
});

describe("shader blending", () => {
  it("blends premultiplied shader fragments over the board", async () => {
    const { gpu } = await setup();
    expect(gpu.pipelines.map((pipeline) => pipeline.name)).toEqual([
      "board",
      "shader",
    ]);
    const boardTarget = gpu.pipelines[0]?.descriptor.fragment?.targets?.[0];
    const shaderTarget = gpu.pipelines[1]?.descriptor.fragment?.targets?.[0];
    expect(boardTarget?.blend).toBeUndefined();
    expect(shaderTarget?.format).toBe("rgba8unorm");
    expect(shaderTarget?.blend).toEqual({
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
    });
  });
});
