export interface ShaderBackingSize {
  width: number;
  height: number;
}

export interface ShaderProgramResult {
  program: WebGLProgram | null;
  error: string | null;
}

export const SHADER_VERTEX_SOURCE = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export function shaderBackingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxDimension = 8192,
): ShaderBackingSize {
  const ratio = Number.isFinite(devicePixelRatio)
    ? Math.max(1, devicePixelRatio)
    : 1;
  const width = Math.round(cssWidth * ratio);
  const height = Math.round(cssHeight * ratio);
  return {
    width: Math.min(maxDimension, Math.max(1, width)),
    height: Math.min(maxDimension, Math.max(1, height)),
  };
}

let shaderModuleSequence = 0;

export function shaderModuleUrl(src: string): string {
  shaderModuleSequence += 1;
  const clean = src.split("?")[0]?.replace(/^\/+/, "") ?? "";
  return `/@ombrique-shader/${shaderModuleSequence}/${clean}`;
}

export async function loadShaderSource(
  src: string,
  importer: (url: string) => Promise<unknown> = (url) =>
    import(/* @vite-ignore */ url),
): Promise<string> {
  const module = (await importer(shaderModuleUrl(src))) as {
    default?: unknown;
  };
  if (typeof module?.default !== "string") {
    throw new Error(`shader module did not export source text: ${src}`);
  }
  return module.default;
}

function compileStage(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): { shader: WebGLShader | null; error: string | null } {
  const shader = gl.createShader(type);
  if (!shader)
    return { shader: null, error: `${label} shader allocation failed` };
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown compiler error";
    gl.deleteShader(shader);
    return { shader: null, error: `${label} shader compile failed: ${log}` };
  }
  return { shader, error: null };
}

export function createShaderProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
): ShaderProgramResult {
  const vertex = compileStage(
    gl,
    gl.VERTEX_SHADER,
    SHADER_VERTEX_SOURCE,
    "vertex",
  );
  if (!vertex.shader) return { program: null, error: vertex.error };
  const fragment = compileStage(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
    "fragment",
  );
  if (!fragment.shader) {
    gl.deleteShader(vertex.shader);
    return { program: null, error: fragment.error };
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex.shader);
    gl.deleteShader(fragment.shader);
    return { program: null, error: "program allocation failed" };
  }
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.linkProgram(program);
  gl.deleteShader(vertex.shader);
  gl.deleteShader(fragment.shader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown linker error";
    gl.deleteProgram(program);
    return { program: null, error: `program link failed: ${log}` };
  }
  return { program, error: null };
}

export function disposeShaderProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram | null,
): void {
  if (program) gl.deleteProgram(program);
}

export function drawShaderFrame(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  resolution: ShaderBackingSize,
  time: number,
): void {
  gl.useProgram(program);
  const timeLocation = gl.getUniformLocation(program, "u_time");
  if (timeLocation !== null) gl.uniform1f(timeLocation, time);
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  if (resolutionLocation !== null) {
    gl.uniform2f(resolutionLocation, resolution.width, resolution.height);
  }
  gl.viewport(0, 0, resolution.width, resolution.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
