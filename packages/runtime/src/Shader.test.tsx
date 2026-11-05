import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadShaderSource } from "./shader-renderer";
import { SHADER_SYNC_EVENT, Shader } from "./Shader";

vi.mock("./shader-renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shader-renderer")>();
  return { ...actual, loadShaderSource: vi.fn() };
});

interface FakeGlState {
  uniforms: Array<{ name: string; value: number[] }>;
  draws: number;
  viewports: Array<[number, number, number, number]>;
  contexts: Array<{ type: string; options?: WebGLContextAttributes }>;
}

function createFakeGl(state: FakeGlState): WebGL2RenderingContext {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TRIANGLES: 5,
    COLOR_BUFFER_BIT: 6,
    MAX_TEXTURE_SIZE: 7,
    createShader: () => ({ type: 0 }),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: () => {},
    useProgram: () => {},
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    uniform1f: (location: { name: string }, value: number) => {
      state.uniforms.push({ name: location.name, value: [value] });
    },
    uniform2f: (location: { name: string }, x: number, y: number) => {
      state.uniforms.push({ name: location.name, value: [x, y] });
    },
    viewport: (x: number, y: number, width: number, height: number) => {
      state.viewports.push([x, y, width, height]);
    },
    clearColor: () => {},
    clear: () => {},
    drawArrays: () => {
      state.draws += 1;
    },
    getParameter: () => 8192,
  };
  return gl as unknown as WebGL2RenderingContext;
}

function hostWithBoard(): { host: HTMLCanvasElement; board: HTMLElement } {
  const host = document.createElement("canvas");
  host.setAttribute("content", "drawable");
  document.body.appendChild(host);
  const board = document.createElement("section");
  board.className = "board";
  host.appendChild(board);
  return { host, board };
}

const fragment = "#version 300 es\nout vec4 c;\nvoid main(){c=vec4(1.0);}\n";

let state: FakeGlState;

beforeEach(() => {
  state = { uniforms: [], draws: 0, viewports: [], contexts: [] };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((
    type: string,
    options?: WebGLContextAttributes,
  ) => {
    state.contexts.push({ type, options });
    return createFakeGl(state);
  }) as never);
  vi.mocked(loadShaderSource).mockReset();
  vi.mocked(loadShaderSource).mockResolvedValue(fragment);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Shader", () => {
  it("promotes its WebGL canvas to a direct drawable child of the host canvas", async () => {
    const { host, board } = hostWithBoard();
    const container = document.createElement("div");
    board.appendChild(container);
    const { container: rendered } = render(
      <Shader
        name="Gradient"
        x={40}
        y={60}
        width={210}
        height={150}
        radius={12}
        src="shaders/demo.glsl"
        time={0}
      />,
      { container },
    );
    const anchor = rendered.querySelector<HTMLElement>(
      "[data-ombrique-shader]",
    );
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("data-name")).toBe("Gradient");
    expect(anchor?.dataset.shaderX).toBe("40");
    expect(anchor?.dataset.shaderY).toBe("60");
    expect(anchor?.dataset.shaderWidth).toBe("210");
    expect(anchor?.dataset.shaderHeight).toBe("150");
    expect(anchor?.dataset.shaderRadius).toBe("12");

    await waitFor(() => {
      expect(
        host.querySelector<HTMLCanvasElement>("canvas[data-shader-id]")?.dataset
          .shaderStatus,
      ).toBe("ready");
    });
    const canvas = host.querySelector<HTMLCanvasElement>(
      "canvas[data-shader-id]",
    );
    expect(canvas).not.toBeNull();
    expect(canvas?.parentElement).toBe(host);
    expect(canvas?.hasAttribute("drawable")).toBe(true);
    expect(canvas?.dataset.shaderId).toBe(anchor?.dataset.shaderId);
    expect(canvas?.width).toBe(210);
    expect(canvas?.height).toBe(150);
    expect(canvas?.style.position).toBe("absolute");
    expect(canvas?.style.width).toBe("210px");
    expect(canvas?.style.height).toBe("150px");
    expect(canvas?.style.borderRadius).toBe("12px");
    expect(state.contexts).toContainEqual({
      type: "webgl2",
      options: {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
        premultipliedAlpha: true,
      },
    });
  });

  it("renders one static frame with fixed u_time and backing-store u_resolution", async () => {
    const { host, board } = hostWithBoard();
    const container = document.createElement("div");
    board.appendChild(container);
    render(
      <Shader
        x={0}
        y={0}
        width={120}
        height={80}
        src="shaders/demo.glsl"
        time={2.5}
      />,
      { container },
    );
    await waitFor(() => {
      expect(
        host.querySelector<HTMLCanvasElement>("canvas[data-shader-id]")?.dataset
          .shaderStatus,
      ).toBe("ready");
    });
    const canvas = host.querySelector<HTMLCanvasElement>(
      "canvas[data-shader-id]",
    );
    expect(canvas?.width).toBe(120);
    expect(canvas?.height).toBe(80);
    expect(state.uniforms).toEqual([
      { name: "u_time", value: [2.5] },
      { name: "u_resolution", value: [120, 80] },
    ]);
    expect(state.draws).toBe(1);
    expect(state.viewports).toEqual([[0, 0, 120, 80]]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(state.draws).toBe(1);
  });

  it("scales the backing store by the device pixel ratio", async () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      "devicePixelRatio",
    );
    Object.defineProperty(globalThis, "devicePixelRatio", {
      configurable: true,
      value: 1.6667,
    });
    try {
      const { host, board } = hostWithBoard();
      const container = document.createElement("div");
      board.appendChild(container);
      render(
        <Shader x={0} y={0} width={210} height={150} src="shaders/demo.glsl" />,
        { container },
      );
      await waitFor(() => {
        expect(
          host.querySelector<HTMLCanvasElement>("canvas[data-shader-id]")
            ?.dataset.shaderStatus,
        ).toBe("ready");
      });
      const canvas = host.querySelector<HTMLCanvasElement>(
        "canvas[data-shader-id]",
      );
      expect(canvas?.width).toBe(350);
      expect(canvas?.height).toBe(250);
      expect(state.uniforms).toContainEqual({
        name: "u_resolution",
        value: [350, 250],
      });
      expect(canvas?.style.width).toBe("210px");
      expect(canvas?.style.height).toBe("150px");
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "devicePixelRatio", original);
      } else {
        Reflect.deleteProperty(globalThis, "devicePixelRatio");
      }
    }
  });

  it("announces shader readiness so the compositor can pick the layer up", async () => {
    const { host, board } = hostWithBoard();
    const container = document.createElement("div");
    board.appendChild(container);
    const events: string[] = [];
    const listener = () => {
      events.push("sync");
    };
    document.addEventListener(SHADER_SYNC_EVENT, listener);
    render(
      <Shader x={0} y={0} width={40} height={40} src="shaders/demo.glsl" />,
      { container },
    );
    await waitFor(() => {
      expect(
        host.querySelector<HTMLCanvasElement>("canvas[data-shader-id]")?.dataset
          .shaderStatus,
      ).toBe("ready");
    });
    document.removeEventListener(SHADER_SYNC_EVENT, listener);
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it("shows a diagnostic instead of a silent blank when loading fails", async () => {
    vi.mocked(loadShaderSource).mockRejectedValue(
      new Error("shader source unavailable (404)"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { host, board } = hostWithBoard();
    const container = document.createElement("div");
    board.appendChild(container);
    const { container: rendered } = render(
      <Shader x={0} y={0} width={64} height={64} src="shaders/missing.glsl" />,
      { container },
    );
    const anchor = rendered.querySelector<HTMLElement>(
      "[data-ombrique-shader]",
    );
    await waitFor(() => {
      expect(
        host.querySelector<HTMLCanvasElement>("canvas[data-shader-id]")?.dataset
          .shaderStatus,
      ).toBe("error");
    });
    expect(anchor?.textContent).toContain("shader source unavailable (404)");
    const canvas = host.querySelector<HTMLCanvasElement>(
      "canvas[data-shader-id]",
    );
    expect(canvas?.dataset.shaderStatus).toBe("error");
    expect(canvas?.style.display).toBe("none");
    expect(state.draws).toBe(0);
    expect(consoleError).toHaveBeenCalled();
  });

  it("removes the promoted canvas when the node unmounts", async () => {
    const { host, board } = hostWithBoard();
    const container = document.createElement("div");
    board.appendChild(container);
    const { unmount } = render(
      <Shader x={0} y={0} width={32} height={32} src="shaders/demo.glsl" />,
      { container },
    );
    await waitFor(() => {
      expect(
        host.querySelector<HTMLCanvasElement>("canvas[data-shader-id]")?.dataset
          .shaderStatus,
      ).toBe("ready");
    });
    expect(host.querySelectorAll("canvas[data-shader-id]")).toHaveLength(1);
    unmount();
    expect(host.querySelectorAll("canvas[data-shader-id]")).toHaveLength(0);
  });

  it("falls back to rendering inside the anchor without a drawable host", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { container: rendered } = render(
      <Shader x={0} y={0} width={32} height={32} src="shaders/demo.glsl" />,
      { container },
    );
    const anchor = rendered.querySelector<HTMLElement>(
      "[data-ombrique-shader]",
    );
    await waitFor(() => {
      expect(anchor?.querySelector("canvas")?.dataset.shaderStatus).toBe(
        "ready",
      );
    });
    const canvas = anchor?.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.parentElement).toBe(anchor);
    expect(state.draws).toBe(1);
  });
});
