import { describe, expect, it, vi } from "vitest";
import {
  createShaderProgram,
  drawShaderFrame,
  loadShaderSource,
  shaderBackingSize,
  shaderModuleUrl,
} from "./shader-renderer";

interface FakeShader {
  type: number;
  source: string;
}

interface FakeProgram {
  shaders: FakeShader[];
}

interface FakeGlOptions {
  failVertex?: boolean;
  failFragment?: boolean;
  failLink?: boolean;
  vertexLog?: string;
  fragmentLog?: string;
  linkLog?: string;
  missingUniforms?: boolean;
}

function createFakeGl(options: FakeGlOptions = {}) {
  const compiled: FakeShader[] = [];
  const deletedShaders: FakeShader[] = [];
  const deletedPrograms: FakeProgram[] = [];
  const uniforms: Array<{ kind: string; name: string; value: number[] }> = [];
  const draws: Array<{ mode: number; first: number; count: number }> = [];
  const viewports: Array<[number, number, number, number]> = [];
  let program: FakeProgram | null = null;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TRIANGLES: 5,
    COLOR_BUFFER_BIT: 6,
    createShader: (type: number): FakeShader => ({
      type,
      source: "",
    }),
    shaderSource: (shader: FakeShader, source: string): void => {
      shader.source = source;
    },
    compileShader: (shader: FakeShader): void => {
      compiled.push(shader);
    },
    getShaderParameter: (shader: FakeShader): boolean =>
      shader.type === 1 ? !options.failVertex : !options.failFragment,
    getShaderInfoLog: (shader: FakeShader): string =>
      (shader.type === 1 ? options.vertexLog : options.fragmentLog) ?? "",
    deleteShader: (shader: FakeShader): void => {
      deletedShaders.push(shader);
    },
    createProgram: (): FakeProgram => ({ shaders: [] }),
    attachShader: (target: FakeProgram, shader: FakeShader): void => {
      target.shaders.push(shader);
    },
    linkProgram: (target: FakeProgram): void => {
      program = target;
    },
    getProgramParameter: (): boolean => !options.failLink,
    getProgramInfoLog: (): string => options.linkLog ?? "",
    deleteProgram: (target: FakeProgram): void => {
      deletedPrograms.push(target);
    },
    useProgram: (target: FakeProgram | null): void => {
      program = target;
    },
    getUniformLocation: (
      _target: FakeProgram,
      name: string,
    ): { name: string } | null => (options.missingUniforms ? null : { name }),
    uniform1f: (location: { name: string }, value: number): void => {
      uniforms.push({ kind: "1f", name: location.name, value: [value] });
    },
    uniform2f: (location: { name: string }, x: number, y: number): void => {
      uniforms.push({ kind: "2f", name: location.name, value: [x, y] });
    },
    viewport: (x: number, y: number, width: number, height: number): void => {
      viewports.push([x, y, width, height]);
    },
    clearColor: (): void => {},
    clear: (): void => {},
    drawArrays: (mode: number, first: number, count: number): void => {
      draws.push({ mode, first, count });
    },
  };
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    raw: gl,
    compiled,
    deletedShaders,
    deletedPrograms,
    uniforms,
    draws,
    viewports,
    currentProgram: () => program,
  };
}

describe("shaderBackingSize", () => {
  it("scales the backing store by the device pixel ratio", () => {
    expect(shaderBackingSize(210, 150, 1.6667)).toEqual({
      width: 350,
      height: 250,
    });
    expect(shaderBackingSize(1440, 900, 2)).toEqual({
      width: 2880,
      height: 1800,
    });
  });

  it("never drops below one pixel or above the texture limit", () => {
    expect(shaderBackingSize(0, 0, 0.5)).toEqual({ width: 1, height: 1 });
    expect(shaderBackingSize(10, 20, Number.NaN)).toEqual({
      width: 10,
      height: 20,
    });
    expect(shaderBackingSize(9000, 9000, 1, 4096)).toEqual({
      width: 4096,
      height: 4096,
    });
  });
});

describe("shaderModuleUrl", () => {
  it("builds a unique compiler URL per load with a normalized path", () => {
    const first = shaderModuleUrl("shaders/mesh-gradient.glsl");
    const second = shaderModuleUrl("/shaders/mesh-gradient.glsl?v=3");
    expect(first).toMatch(
      /^\/@ombrique-shader\/\d+\/shaders\/mesh-gradient\.glsl$/,
    );
    expect(second).toMatch(
      /^\/@ombrique-shader\/\d+\/shaders\/mesh-gradient\.glsl$/,
    );
    expect(first).not.toBe(second);
  });
});

describe("loadShaderSource", () => {
  it("imports the virtual module and returns its source export", async () => {
    const importer = vi.fn(async (_url: string) => ({
      default: "#version 300 es\n",
    }));
    const text = await loadShaderSource("shaders/mesh-gradient.glsl", importer);
    expect(text).toBe("#version 300 es\n");
    expect(importer).toHaveBeenCalledTimes(1);
    const url = importer.mock.calls[0]?.[0];
    expect(url).toMatch(
      /^\/@ombrique-shader\/\d+\/shaders\/mesh-gradient\.glsl$/,
    );
  });

  it("rejects when the module has no source export", async () => {
    const importer = vi.fn(async () => ({ default: 42 }));
    await expect(
      loadShaderSource("shaders/missing.glsl", importer),
    ).rejects.toThrow(/did not export source text/);
  });

  it("propagates import failures", async () => {
    const importer = vi.fn(async () => {
      throw new Error("compile failed");
    });
    await expect(
      loadShaderSource("shaders/broken.glsl", importer),
    ).rejects.toThrow("compile failed");
  });
});

describe("createShaderProgram", () => {
  it("compiles the fixed vertex shader with the provided fragment source", () => {
    const fake = createFakeGl();
    const fragment =
      "#version 300 es\nout vec4 c;\nvoid main(){c=vec4(1.0);}\n";
    const result = createShaderProgram(fake.gl, fragment);
    expect(result.error).toBeNull();
    expect(result.program).not.toBeNull();
    expect(fake.compiled.map((shader) => shader.type)).toEqual([1, 2]);
    expect(fake.compiled[1]?.source).toBe(fragment);
    expect(fake.compiled[0]?.source).toContain("gl_VertexID");
    expect(fake.deletedShaders).toHaveLength(2);
    expect(fake.currentProgram()?.shaders).toHaveLength(2);
  });

  it("surfaces fragment compile diagnostics and releases the vertex shader", () => {
    const fake = createFakeGl({
      failFragment: true,
      fragmentLog: "ERROR: 0:4: 'x' undeclared",
    });
    const result = createShaderProgram(fake.gl, "void main() {}");
    expect(result.program).toBeNull();
    expect(result.error).toContain("fragment shader compile failed");
    expect(result.error).toContain("'x' undeclared");
    expect(fake.deletedShaders.map((shader) => shader.type).sort()).toEqual([
      1, 2,
    ]);
  });

  it("surfaces vertex compile diagnostics", () => {
    const fake = createFakeGl({
      failVertex: true,
      vertexLog: "ERROR: vertex boom",
    });
    const result = createShaderProgram(fake.gl, "void main() {}");
    expect(result.error).toContain("vertex shader compile failed");
    expect(result.error).toContain("vertex boom");
    expect(fake.deletedShaders.map((shader) => shader.type)).toEqual([1]);
  });
});

describe("drawShaderFrame", () => {
  it("sets u_time and u_resolution once and draws a fullscreen triangle", () => {
    const fake = createFakeGl();
    const result = createShaderProgram(fake.gl, "void main() {}");
    if (!result.program) throw new Error("program missing");
    drawShaderFrame(fake.gl, result.program, { width: 350, height: 250 }, 0);
    expect(fake.uniforms).toEqual([
      { kind: "1f", name: "u_time", value: [0] },
      { kind: "2f", name: "u_resolution", value: [350, 250] },
    ]);
    expect(fake.draws).toEqual([{ mode: 5, first: 0, count: 3 }]);
    expect(fake.viewports).toEqual([[0, 0, 350, 250]]);
  });

  it("keeps the requested fixed time instead of advancing", () => {
    const fake = createFakeGl();
    const result = createShaderProgram(fake.gl, "void main() {}");
    if (!result.program) throw new Error("program missing");
    drawShaderFrame(fake.gl, result.program, { width: 8, height: 8 }, 3.25);
    drawShaderFrame(fake.gl, result.program, { width: 8, height: 8 }, 3.25);
    expect(fake.uniforms.filter((entry) => entry.name === "u_time")).toEqual([
      { kind: "1f", name: "u_time", value: [3.25] },
      { kind: "1f", name: "u_time", value: [3.25] },
    ]);
    expect(fake.draws).toHaveLength(2);
  });

  it("draws even when the shader optimizes both uniforms away", () => {
    const fake = createFakeGl({ missingUniforms: true });
    const result = createShaderProgram(fake.gl, "void main() {}");
    if (!result.program) throw new Error("program missing");
    drawShaderFrame(fake.gl, result.program, { width: 4, height: 4 }, 0);
    expect(fake.uniforms).toHaveLength(0);
    expect(fake.draws).toHaveLength(1);
  });
});
