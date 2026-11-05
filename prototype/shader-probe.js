const params = new URLSearchParams(location.search);
const MODE = params.get("mode") || "shader-capture";
const cv = document.getElementById("cv");
const hudText = document.getElementById("hudText");
const results = { mode: MODE, env: {}, gpuErrors: [], errors: [], scenarios: {} };
const gpuErrors = [];
const dpr = devicePixelRatio || 1;
const cssW = innerWidth;
const cssH = innerHeight;
let device = null;
let ctx = null;
let canvasFormat = "";
let sampler = null;
let pipeline = null;

const EXPECT = {
  dom: [0, 255, 0],
  glLeft: [255, 0, 0],
  glRight: [0, 0, 255],
  twoLeft: [255, 255, 0],
  twoRight: [0, 255, 255],
};

const SMALL_W = 480;
const SMALL_H = 320;
const LARGE_W = 2000;
const LARGE_H = 1500;
const smallLayout = { domX: 20, domY: 70, domW: 440, domH: 24, glX: 20, glY: 110, twoX: 250, twoY: 110, cw: 210, ch: 150 };
const largeLayout = { domX: 40, domY: 120, domW: 1920, domH: 48, glX: 40, glY: 220, twoX: 980, twoY: 220, cw: 600, ch: 420 };

const WGSL = `
struct Rect {
  x0: f32,
  y0: f32,
  x1: f32,
  y1: f32,
}
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> r: Rect;
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> Out {
  var quad = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );
  let p = quad[vi];
  var out: Out;
  out.pos = vec4f(mix(r.x0, r.x1, p.x), mix(r.y0, r.y1, p.y), 0.0, 1.0);
  out.uv = p;
  return out;
}
@fragment
fn fs(in: Out) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`;

const GL_VS = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const GL_FS = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_res;
out vec4 outColor;
void main() {
  float split = 0.5 + 0.35 * sin(u_time);
  float x = gl_FragCoord.x / u_res.x;
  vec3 c = x < split ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  outColor = vec4(c, 1.0);
}
`;

function round1(v) {
  return Math.round(v * 10) / 10;
}

let rafFallbacks = 0;
let forcePaint = false;

async function waitFrames(n) {
  for (let i = 0; i < n; i += 1) {
    if (forcePaint) {
      try {
        cv.requestPaint();
      } catch (err) {
        results.errors.push(`requestPaint: ${String(err)}`);
      }
    }
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      const timer = setTimeout(() => {
        rafFallbacks += 1;
        finish();
      }, 60);
      requestAnimationFrame(() => {
        clearTimeout(timer);
        finish();
      });
    });
  }
}

function step(msg) {
  console.log(`[shader] ${msg}`);
}

function dist(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function clampInt(v, max) {
  return Math.min(max, Math.max(0, Math.round(v)));
}

function calibrateGreen(read, rect) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let n = 0;
  for (let y = 0; y < read.h; y += 1) {
    for (let x = 0; x < read.w; x += 1) {
      const o = y * read.bpr + x * 4;
      if (read.data[o + 3] > 200 && dist([read.data[o], read.data[o + 1], read.data[o + 2]], EXPECT.dom) <= 30) {
        n += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!n) return null;
  return {
    greenPixelCount: n,
    bounds: [minX, minY, maxX, maxY],
    scale: [round1(((maxX - minX + 1) / rect.w) * 1000) / 1000, round1(((maxY - minY + 1) / rect.h) * 1000) / 1000],
    origin: [minX, minY],
    domRect: rect,
  };
}

function countNear(read, rgb, tol) {
  let n = 0;
  for (let y = 0; y < read.h; y += 2) {
    for (let x = 0; x < read.w; x += 2) {
      const o = y * read.bpr + x * 4;
      if (read.data[o + 3] > 200 && dist([read.data[o], read.data[o + 1], read.data[o + 2]], rgb) <= tol) n += 1;
    }
  }
  return n;
}

function hud(msg) {
  hudText.textContent = msg;
}

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return { error: gl.getShaderInfoLog(sh) };
  return { shader: sh };
}

function makeGl(canvas, opts) {
  const gl = canvas.getContext("webgl2", opts);
  if (!gl) return { error: "getContext(webgl2) returned null", opts };
  const v = compileShader(gl, gl.VERTEX_SHADER, GL_VS);
  if (v.error) return { error: `vertex shader: ${v.error}`, opts };
  const f = compileShader(gl, gl.FRAGMENT_SHADER, GL_FS);
  if (f.error) return { error: `fragment shader: ${f.error}`, opts };
  const prog = gl.createProgram();
  gl.attachShader(prog, v.shader);
  gl.attachShader(prog, f.shader);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { error: `link: ${gl.getProgramInfoLog(prog)}`, opts };
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uRes = gl.getUniformLocation(prog, "u_res");
  const aPos = gl.getAttribLocation(prog, "a_pos");
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const state = {
    canvas,
    gl,
    opts,
    drawCount: 0,
    lastTime: null,
    attrs: gl.getContextAttributes(),
    info: {
      version: gl.getParameter(gl.VERSION),
      renderer: gl.getParameter(gl.RENDERER),
      vendor: gl.getParameter(gl.VENDOR),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    },
    draw(t) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.flush();
      gl.bindVertexArray(null);
      state.drawCount += 1;
      state.lastTime = t;
    },
    read(x, y) {
      const px = new Uint8Array(4);
      gl.readPixels(Math.round(x), canvas.height - 1 - Math.round(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return Array.from(px);
    },
    glError() {
      return gl.getError();
    },
    release() {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
  state.draw(0);
  return state;
}

function draw2d(c, w, h) {
  c.fillStyle = "#ffff00";
  c.fillRect(0, 0, w / 2, h);
  c.fillStyle = "#00ffff";
  c.fillRect(w / 2, 0, w / 2, h);
}

function createBoard(spec) {
  const L = spec.layout;
  const el = document.createElement("section");
  el.className = "board";
  el.setAttribute("drawable", "");
  el.dataset.id = spec.id;
  el.style.cssText = `left:${spec.x}px;top:${spec.y}px;width:${spec.w}px;height:${spec.h}px`;
  const title = document.createElement("h2");
  title.textContent = spec.title;
  title.style.cssText = `position:absolute;left:${L.domX}px;top:${L.domY - 44}px`;
  const dom = document.createElement("div");
  dom.style.cssText = `position:absolute;left:${L.domX}px;top:${L.domY}px;width:${L.domW}px;height:${L.domH}px;background:#00ff00`;
  const two = document.createElement("canvas");
  two.width = L.cw;
  two.height = L.ch;
  two.style.cssText = `position:absolute;left:${L.twoX}px;top:${L.twoY}px;width:${L.cw}px;height:${L.ch}px`;
  const glc = document.createElement("canvas");
  glc.width = L.cw;
  glc.height = L.ch;
  glc.style.cssText = `position:absolute;left:${L.glX}px;top:${L.glY}px;width:${L.cw}px;height:${L.ch}px`;
  if (spec.nestedDrawable) glc.setAttribute("drawable", "");
  el.append(title, dom, two, glc);
  if (spec.extraNodes) {
    for (let i = 0; i < spec.extraNodes; i += 1) {
      const n = document.createElement("div");
      n.textContent = `node ${i} shader capture sample text 0123456789`;
      n.style.cssText = `position:absolute;left:${40 + (i % 6) * 310}px;top:${700 + Math.floor(i / 6) * 90}px;width:280px;height:64px;box-sizing:border-box;background:hsl(${(i * 37) % 360} 70% 82%);font:18px system-ui;color:#222`;
      el.appendChild(n);
    }
  }
  cv.appendChild(el);
  const twoCtx = two.getContext("2d");
  draw2d(twoCtx, two.width, two.height);
  const points = {
    dom: [L.domX + L.domW / 2, L.domY + L.domH / 2],
    glLeft: [L.glX + L.cw * 0.25, L.glY + L.ch * 0.5],
    glRight: [L.glX + L.cw * 0.75, L.glY + L.ch * 0.5],
    twoLeft: [L.twoX + L.cw * 0.25, L.twoY + L.ch * 0.5],
    twoRight: [L.twoX + L.cw * 0.75, L.twoY + L.ch * 0.5],
  };
  const gl = spec.gl === false ? null : makeGl(glc, spec.gl || {});
  const board = {
    id: spec.id,
    el,
    domEl: dom,
    two,
    twoCtx,
    gl,
    glc,
    w: spec.w,
    h: spec.h,
    points,
    layout: L,
    domRect: { x: L.domX, y: L.domY, w: L.domW, h: L.domH },
    glOptions: spec.gl || {},
    nestedDrawable: !!spec.nestedDrawable,
    tex: null,
    bind: null,
    source: {
      dom: [0, 255, 0],
      twoLeft: Array.from(twoCtx.getImageData(L.cw * 0.25, L.ch * 0.5, 1, 1).data),
      twoRight: Array.from(twoCtx.getImageData(L.cw * 0.75, L.ch * 0.5, 1, 1).data),
    },
  };
  if (gl && !gl.error) {
    board.source.glLeft = gl.read(L.cw * 0.25, L.ch * 0.5);
    board.source.glRight = gl.read(L.cw * 0.75, L.ch * 0.5);
    board.glInfo = gl.info;
    board.glAttrs = gl.attrs;
    board.glErrorNumber = gl.glError();
  } else if (gl) {
    board.glError = gl.error;
  }
  return board;
}

function ndcRect(x, y, w, h) {
  return [(x / cssW) * 2 - 1, 1 - (y / cssH) * 2, ((x + w) / cssW) * 2 - 1, 1 - ((y + h) / cssH) * 2];
}

function fitRect(board) {
  const scale = Math.min((cssW - 40) / board.w, (cssH - 40) / board.h, 1);
  return ndcRect(20, 20, board.w * scale, board.h * scale);
}

function createTex(w, h) {
  return device.createTexture({
    size: [w, h],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

function makeDisplayBind(texture, rect) {
  const ub = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ub, 0, new Float32Array(rect));
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: { buffer: ub } },
    ],
  });
}

function renderDisplay(binds) {
  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.063, g: 0.063, b: 0.078, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);
  for (const b of binds) {
    pass.setBindGroup(0, b);
    pass.draw(6);
  }
  pass.end();
  device.queue.submit([enc.finish()]);
}

async function readTexture(tex, w, h) {
  const bpr = Math.ceil((w * 4) / 256) * 256;
  const buf = device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr, rowsPerImage: h }, { width: w, height: h });
  device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const data = new Uint8Array(buf.getMappedRange()).slice();
  buf.unmap();
  buf.destroy();
  return { w, h, bpr, data };
}

async function readPixelAt(tex, x, y) {
  const bpr = 256;
  const buf = device.createBuffer({ size: bpr, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: tex, origin: { x: Math.round(x), y: Math.round(y) } }, { buffer: buf, bytesPerRow: bpr }, { width: 1, height: 1 });
  device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const data = new Uint8Array(buf.getMappedRange()).slice();
  buf.unmap();
  buf.destroy();
  return [data[0], data[1], data[2], data[3]];
}

async function shaderSignature(tex, w, h) {
  const read = await readTexture(tex, w, h);
  const y = Math.min(h - 1, Math.round(h * 0.3));
  const sig = [];
  for (let i = 0; i < 16; i += 1) {
    const x = Math.min(w - 1, Math.round((w * (i + 0.5)) / 16));
    const o = y * read.bpr + x * 4;
    sig.push([read.data[o], read.data[o + 1], read.data[o + 2], read.data[o + 3]]);
  }
  return sig;
}

function analyze(read, points, boardW, boardH, domRect) {
  const sx = read.w / boardW;
  const sy = read.h / boardH;
  const cal = domRect ? calibrateGreen(read, domRect) : null;
  const raw = {};
  for (const k of Object.keys(points)) {
    const [x, y] = points[k];
    const u = cal ? (x - domRect.x) * cal.scale[0] + cal.origin[0] : x * sx;
    const v = cal ? (y - domRect.y) * cal.scale[1] + cal.origin[1] : y * sy;
    const px = clampInt(u, read.w - 1);
    const py = clampInt(v, read.h - 1);
    const o = py * read.bpr + px * 4;
    raw[k] = [read.data[o], read.data[o + 1], read.data[o + 2], read.data[o + 3]];
  }
  const swappedRed = [EXPECT.glLeft[2], EXPECT.glLeft[1], EXPECT.glLeft[0]];
  const swappedBlue = [EXPECT.glRight[2], EXPECT.glRight[1], EXPECT.glRight[0]];
  const rgbaScore = dist(raw.glLeft, EXPECT.glLeft) + dist(raw.glRight, EXPECT.glRight);
  const bgraScore = dist(raw.glLeft, swappedRed) + dist(raw.glRight, swappedBlue);
  const order = rgbaScore <= bgraScore ? "rgba" : "bgra";
  const conv = (p) => (order === "rgba" ? [p[0], p[1], p[2], p[3]] : [p[2], p[1], p[0], p[3]]);
  const samples = {};
  const matches = {};
  for (const k of Object.keys(points)) {
    samples[k] = conv(raw[k]);
    matches[k] = dist(samples[k], EXPECT[k]) <= 30 && samples[k][3] > 200;
  }
  let opaque = 0;
  let nonzero = 0;
  let total = 0;
  let minCX = Infinity;
  let minCY = Infinity;
  let maxCX = -1;
  let maxCY = -1;
  const hits = { red: 0, blue: 0, yellow: 0, cyan: 0, green: 0 };
  for (let y = 0; y < read.h; y += 2) {
    for (let x = 0; x < read.w; x += 2) {
      const o = y * read.bpr + x * 4;
      const a = read.data[o + 3];
      total += 1;
      if (a > 0) nonzero += 1;
      if (a > 200) {
        opaque += 1;
        if (x < minCX) minCX = x;
        if (x > maxCX) maxCX = x;
        if (y < minCY) minCY = y;
        if (y > maxCY) maxCY = y;
      }
      const p = conv([read.data[o], read.data[o + 1], read.data[o + 2], a]);
      if (dist(p, EXPECT.glLeft) <= 30) hits.red += 1;
      if (dist(p, EXPECT.glRight) <= 30) hits.blue += 1;
      if (dist(p, EXPECT.twoLeft) <= 30) hits.yellow += 1;
      if (dist(p, EXPECT.twoRight) <= 30) hits.cyan += 1;
      if (dist(p, EXPECT.dom) <= 30) hits.green += 1;
    }
  }
  return {
    textureSize: `${read.w}x${read.h}`,
    calibration: cal,
    sampleScale: [round1(sx), round1(sy)],
    channelOrder: order,
    samples,
    matches,
    allMatch: Object.values(matches).every(Boolean),
    colorHits: hits,
    opaquePercent: Math.round((opaque / Math.max(1, total)) * 1000) / 10,
    nonzeroPercent: Math.round((nonzero / Math.max(1, total)) * 1000) / 10,
    contentBounds: maxCX >= 0 ? [minCX, minCY, maxCX, maxCY] : null,
  };
}

async function methodDrawElement(board, tex, w, h) {
  const before = gpuErrors.length;
  try {
    device.queue.drawElementImageToTexture({ source: board.el }, { texture: tex, size: { width: w, height: h } });
    device.queue.submit([]);
    await waitFrames(5);
    const read = await readTexture(tex, w, h);
    return { ok: true, ...analyze(read, board.points, board.w, board.h, board.domRect), newGpuErrors: gpuErrors.slice(before) };
  } catch (err) {
    return { ok: false, error: String(err), newGpuErrors: gpuErrors.slice(before) };
  }
}

async function methodCopyFromElement(board, w, h) {
  const before = gpuErrors.length;
  let tex = null;
  try {
    tex = createTex(w, h);
    device.queue.copyElementImageToTexture({ source: board.el }, { destination: { texture: tex } });
    device.queue.submit([]);
    await waitFrames(5);
    const out = { ok: true, ...analyze(await readTexture(tex, w, h), board.points, board.w, board.h, board.domRect), newGpuErrors: gpuErrors.slice(before) };
    tex.destroy();
    return out;
  } catch (err) {
    if (tex) tex.destroy();
    return { ok: false, error: String(err), newGpuErrors: gpuErrors.slice(before) };
  }
}

async function methodCapture(board, w, h) {
  const before = gpuErrors.length;
  const out = { ok: false, newGpuErrors: gpuErrors.slice(before) };
  let img = null;
  try {
    img = cv.captureElementImage(board.el);
    out.capture = {
      type: Object.prototype.toString.call(img),
      width: img ? img.width : null,
      height: img ? img.height : null,
      hasClose: typeof img?.close === "function",
    };
  } catch (err) {
    out.error = `captureElementImage threw: ${String(err)}`;
    return out;
  }
  if (!img || !(img.width > 0 && img.height > 0)) {
    out.error = "captureElementImage returned null or zero-sized image";
    img?.close?.();
    return out;
  }
  const iw = Math.round(img.width);
  const ih = Math.round(img.height);
  let tex = null;
  try {
    tex = createTex(iw, ih);
    device.queue.copyElementImageToTexture({ source: img }, { destination: { texture: tex } });
    device.queue.submit([]);
    await waitFrames(5);
    out.copyToTexture = { ok: true, ...analyze(await readTexture(tex, iw, ih), board.points, board.w, board.h, board.domRect) };
    out.ok = !!out.copyToTexture.ok;
  } catch (err) {
    out.copyToTexture = { ok: false, error: String(err) };
  }
  if (tex) tex.destroy();
  let tex2 = null;
  try {
    tex2 = createTex(w, h);
    device.queue.drawElementImageToTexture({ source: img }, { texture: tex2, size: { width: w, height: h } });
    device.queue.submit([]);
    await waitFrames(5);
    out.drawFromImage = { ok: true, ...analyze(await readTexture(tex2, w, h), board.points, board.w, board.h, board.domRect) };
  } catch (err) {
    out.drawFromImage = { ok: false, error: String(err) };
  }
  if (tex2) tex2.destroy();
  try {
    const off = document.createElement("canvas");
    off.width = iw;
    off.height = ih;
    const c2 = off.getContext("2d");
    c2.drawImage(img, 0, 0);
    const d = c2.getImageData(Math.round(board.points.glLeft[0] * (iw / board.w)), Math.round(board.points.glLeft[1] * (ih / board.h)), 1, 1);
    out.drawImage2d = { ok: true, glLeftRaw: Array.from(d.data) };
  } catch (err) {
    out.drawImage2d = { ok: false, error: String(err) };
  }
  out.newGpuErrors = gpuErrors.slice(before);
  img.close?.();
  return out;
}

async function diagnoseNested(board) {
  const out = { board: board.id };
  const targets = { board: board.el, glCanvas: board.glc, twoCanvas: board.two, domBar: board.domEl, title: board.el.querySelector("h2") };
  out.rects = {};
  for (const [k, el] of Object.entries(targets)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.rects[k] = {
      x: round1(r.x), y: round1(r.y), w: round1(r.width), h: round1(r.height),
      offsetW: el.offsetWidth, offsetH: el.offsetHeight,
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
    };
  }
  if (board.gl && !board.gl.error) {
    out.glSourceAtDiagnostics = {
      glLeft: board.gl.read(board.layout.cw * 0.25, board.layout.ch * 0.5),
      glRight: board.gl.read(board.layout.cw * 0.75, board.layout.ch * 0.5),
    };
  }
  const cw = board.layout.cw;
  const ch = board.layout.ch;
  const glPoints = { glLeft: [cw * 0.25, ch * 0.5], glRight: [cw * 0.75, ch * 0.5] };
  const t1 = createTex(cw, ch);
  try {
    device.queue.drawElementImageToTexture({ source: board.glc }, { texture: t1, size: { width: cw, height: ch } });
    device.queue.submit([]);
    await waitFrames(5);
    out.drawNestedCanvasAsRoot = analyze(await readTexture(t1, cw, ch), glPoints, cw, ch, null);
  } catch (err) {
    out.drawNestedCanvasAsRoot = { error: String(err) };
  }
  t1.destroy();
  let img = null;
  try {
    img = cv.captureElementImage(board.glc);
    out.captureNestedCanvasImage = { width: img?.width ?? null, height: img?.height ?? null };
    if (img && img.width > 0 && img.height > 0) {
      const iw = Math.round(img.width);
      const ih = Math.round(img.height);
      const t2 = createTex(iw, ih);
      try {
        device.queue.copyElementImageToTexture({ source: img }, { destination: { texture: t2 } });
        device.queue.submit([]);
        await waitFrames(5);
        out.captureNestedCanvasAsRoot = analyze(await readTexture(t2, iw, ih), glPoints, cw, ch, null);
      } catch (err) {
        out.captureNestedCanvasAsRoot = { error: String(err) };
      }
      t2.destroy();
    }
    img?.close?.();
  } catch (err) {
    out.captureNestedCanvasAsRoot = { error: String(err) };
  }
  const baseColors = { red: [255, 0, 0], blue: [0, 0, 255], yellow: [255, 255, 0], cyan: [0, 255, 255] };
  async function captureBoard(tag, colors) {
    const t = createTex(board.w, board.h);
    device.queue.drawElementImageToTexture({ source: board.el }, { texture: t, size: { width: board.w, height: board.h } });
    device.queue.submit([]);
    await waitFrames(5);
    const read = await readTexture(t, board.w, board.h);
    const a = analyze(read, board.points, board.w, board.h, board.domRect);
    const counts = {};
    for (const [k, c] of Object.entries(colors || {})) counts[k] = countNear(read, c, 30);
    t.destroy();
    return { tag, ...a, customCounts: counts };
  }
  out.baselineBoard = await captureBoard("baseline", baseColors);
  try {
    cv.updateElementGeometry(board.glc, { canvasTransform: new DOMMatrix() });
    out.geometryOnNested = true;
    await waitFrames(4);
    out.afterGeometryOnNested = await captureBoard("geometryOnNested", baseColors);
  } catch (err) {
    out.geometryOnNested = String(err);
  }
  board.glc.style.backgroundColor = "#ff00ff";
  board.two.style.backgroundColor = "#ff00ff";
  await waitFrames(4);
  out.backgroundTest = await captureBoard("canvasBackground", { magenta: [255, 0, 255], ...baseColors });
  board.glc.style.backgroundColor = "";
  board.two.style.backgroundColor = "";
  const off = document.createElement("canvas");
  off.width = cw;
  off.height = ch;
  const c2 = off.getContext("2d");
  c2.fillStyle = "#ff8800";
  c2.fillRect(0, 0, cw, ch);
  const imgEl = document.createElement("img");
  imgEl.src = off.toDataURL();
  imgEl.style.cssText = `position:absolute;left:${board.layout.glX}px;top:${board.layout.glY}px;width:${cw}px;height:${ch}px`;
  board.el.appendChild(imgEl);
  try {
    await imgEl.decode();
  } catch (err) {
    out.imgDecodeError = String(err);
  }
  await waitFrames(4);
  out.imgReplacedTest = await captureBoard("img", { orange: [255, 136, 0], ...baseColors });
  imgEl.remove();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(cw));
  svg.setAttribute("height", String(ch));
  svg.style.cssText = `position:absolute;left:${board.layout.glX}px;top:${board.layout.glY}px`;
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", String(cw));
  rect.setAttribute("height", String(ch));
  rect.setAttribute("fill", "#8000ff");
  svg.appendChild(rect);
  board.el.appendChild(svg);
  await waitFrames(4);
  out.svgReplacedTest = await captureBoard("svg", { purple: [128, 0, 255], ...baseColors });
  svg.remove();
  cv.setAttribute("layoutsubtree", "");
  await waitFrames(4);
  out.hostLayoutSubtreeTest = await captureBoard("hostLayoutSubtree", baseColors);
  cv.removeAttribute("layoutsubtree");
  return out;
}

async function diagnoseTopLevelCanvas() {
  const out = {};
  const cw = 210;
  const ch = 150;
  const el = document.createElement("canvas");
  el.width = cw;
  el.height = ch;
  el.setAttribute("drawable", "");
  el.style.cssText = `position:absolute;left:20px;top:700px;width:${cw}px;height:${ch}px`;
  cv.appendChild(el);
  const gl = makeGl(el, { alpha: true, preserveDrawingBuffer: false });
  out.glError = gl.error ?? null;
  if (!gl.error) gl.draw(0);
  out.glSource = gl.error ? null : {
    glLeft: gl.read(cw * 0.25, ch * 0.5),
    glRight: gl.read(cw * 0.75, ch * 0.5),
  };
  cv.requestPaint();
  try {
    cv.updateElementGeometry(el, { canvasTransform: new DOMMatrix() });
    out.geometry = true;
  } catch (err) {
    out.geometry = String(err);
  }
  await waitFrames(6);
  const points = { glLeft: [cw * 0.25, ch * 0.5], glRight: [cw * 0.75, ch * 0.5] };
  const t1 = createTex(cw, ch);
  try {
    device.queue.drawElementImageToTexture({ source: el }, { texture: t1, size: { width: cw, height: ch } });
    device.queue.submit([]);
    await waitFrames(5);
    out.drawElementImageToTexture = analyze(await readTexture(t1, cw, ch), points, cw, ch, null);
  } catch (err) {
    out.drawElementImageToTexture = { error: String(err) };
  }
  t1.destroy();
  try {
    const img = cv.captureElementImage(el);
    out.captureElementImage = { width: img?.width ?? null, height: img?.height ?? null };
    if (img && img.width > 0 && img.height > 0) {
      const iw = Math.round(img.width);
      const ih = Math.round(img.height);
      const t2 = createTex(iw, ih);
      device.queue.copyElementImageToTexture({ source: img }, { destination: { texture: t2 } });
      device.queue.submit([]);
      await waitFrames(5);
      out.copyToTexture = analyze(await readTexture(t2, iw, ih), points, cw, ch, null);
      t2.destroy();
      img.close?.();
    }
  } catch (err) {
    out.copyToTexture = { error: String(err) };
  }
  if (!gl.error) gl.release();
  el.remove();
  return out;
}

async function envReport() {
  const out = {
    ua: navigator.userAgent,
    chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? null,
    dpr,
    viewport: `${cssW}x${cssH}`,
    canvasContentAttr: cv.content,
    layoutsubtreeAttr: cv.hasAttribute("layoutsubtree"),
    hasOnpaint: "onpaint" in HTMLCanvasElement.prototype,
    hasRequestPaint: typeof cv.requestPaint === "function",
    hasCaptureElementImage: typeof cv.captureElementImage === "function",
    hasUpdateElementGeometry: typeof cv.updateElementGeometry === "function",
    gpuBinding: typeof navigator.gpu !== "undefined",
    canvasFormat,
    queueDraw: typeof device.queue.drawElementImageToTexture === "function",
    queueCopy: typeof device.queue.copyElementImageToTexture === "function",
    maxTextureDimension2D: device.limits.maxTextureDimension2D,
  };
  const probe = document.createElement("canvas");
  probe.width = 8;
  probe.height = 8;
  const gl = probe.getContext("webgl2");
  out.webgl2Standalone = gl
    ? { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR) }
    : null;
  return out;
}

async function initGpu() {
  if (typeof navigator.gpu === "undefined") throw new Error("navigator.gpu unavailable");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("requestAdapter returned null");
  results.env.adapterInfo = adapter.info ? { ...adapter.info } : null;
  device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (e) => gpuErrors.push(e.error.message));
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  ctx = cv.getContext("webgpu");
  if (!ctx) throw new Error("webgpu canvas context unavailable");
  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: canvasFormat, alphaMode: "opaque" });
  sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const mod = device.createShaderModule({ code: WGSL });
  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: mod, entryPoint: "vs" },
    fragment: { module: mod, entryPoint: "fs", targets: [{ format: canvasFormat }] },
    primitive: { topology: "triangle-list" },
  });
}

const captureSpecs = [
  { id: "dom2d", x: 20, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: false, title: "dom2d control" },
  { id: "gl-default", x: 520, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: true, preserveDrawingBuffer: false }, title: "webgl2 default" },
  { id: "gl-preserve", x: 1020, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: true, preserveDrawingBuffer: true }, title: "webgl2 preserve" },
  { id: "gl-noalpha", x: 20, y: 360, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: false, preserveDrawingBuffer: false }, title: "webgl2 alpha false" },
  { id: "gl-preserve-noalpha", x: 520, y: 360, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: false, preserveDrawingBuffer: true }, title: "webgl2 preserve alpha false" },
  { id: "gl-nested-drawable", x: 1020, y: 360, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: true, preserveDrawingBuffer: false }, nestedDrawable: true, title: "webgl2 drawable attr" },
];

async function runCapture() {
  results.env = { ...results.env, ...(await envReport()) };
  step("capture: env ready");
  const boards = captureSpecs.map(createBoard);
  step("capture: boards created");
  results.boardSources = boards.map((b) => ({
    id: b.id,
    glOptions: b.glOptions,
    nestedDrawable: b.nestedDrawable,
    glError: b.glError ?? null,
    glErrorNumber: b.glErrorNumber ?? null,
    glInfo: b.glInfo ?? null,
    glAttrs: b.glAttrs ?? null,
    sourceAtCreation: b.source,
    points: b.points,
  }));
  cv.requestPaint();
  try {
    cv.updateElementGeometry(boards[0].el, { canvasTransform: new DOMMatrix() });
    results.env.updateElementGeometry = true;
  } catch (err) {
    results.env.updateElementGeometry = String(err);
  }
  await waitFrames(8);
  step("capture: initial paint waited");
  for (const b of boards) {
    if (b.gl && !b.gl.error) {
      b.sourceAtCapture = {
        glLeft: b.gl.read(b.layout.cw * 0.25, b.layout.ch * 0.5),
        glRight: b.gl.read(b.layout.cw * 0.75, b.layout.ch * 0.5),
      };
    }
  }
  results.cases = [];
  for (const b of boards) {
    hud(`capturing ${b.id}`);
    const c = { id: b.id, sourceAtCapture: b.sourceAtCapture ?? null };
    step(`capture: case ${b.id} start`);
    if (!b.tex) b.tex = createTex(b.w, b.h);
    c.drawElementImageToTexture = await methodDrawElement(b, b.tex, b.w, b.h);
    c.copyFromElement = await methodCopyFromElement(b, b.w, b.h);
    c.captureElementImage = await methodCapture(b, b.w, b.h);
    results.cases.push(c);
    step(`capture: case ${b.id} done`);
  }
  let redraw = true;
  let redrawFrames = 0;
  const redrawLoop = () => {
    if (!redraw) return;
    for (const b of boards) if (b.gl && !b.gl.error) b.gl.draw(0);
    redrawFrames += 1;
    requestAnimationFrame(redrawLoop);
  };
  requestAnimationFrame(redrawLoop);
  await waitFrames(6);
  const target = boards[1];
  const tex = createTex(target.w, target.h);
  results.redrawPhase = {
    board: target.id,
    framesWithWebglRedrawBeforeCapture: redrawFrames,
    glSourceDuringRedraw: {
      glLeft: target.gl.read(target.layout.cw * 0.25, target.layout.ch * 0.5),
      glRight: target.gl.read(target.layout.cw * 0.75, target.layout.ch * 0.5),
    },
    drawElementImageToTexture: await methodDrawElement(target, tex, target.w, target.h),
    captureElementImage: await methodCapture(target, target.w, target.h),
  };
  tex.destroy();
  redraw = false;
  hud("diagnosing nested canvas");
  results.nestedDiagnostics = await diagnoseNested(boards[1]);
  step("capture: nested diagnostics done");
  hud("diagnosing top-level shader canvas");
  results.topLevelShader = await diagnoseTopLevelCanvas();
  step("capture: top-level diagnostics done");
  const display = [];
  for (const b of boards) {
    if (!b.tex) b.tex = createTex(b.w, b.h);
    device.queue.drawElementImageToTexture({ source: b.el }, { texture: b.tex, size: { width: b.w, height: b.h } });
    device.queue.submit([]);
    b.bind = makeDisplayBind(b.tex, ndcRect(specsX(b), specsY(b), b.w, b.h));
    display.push(b.bind);
  }
  await waitFrames(4);
  renderDisplay(display);
  await waitFrames(2);
  await window.protoBridge.shot("shader-capture-composited");
  results.gpuErrors = gpuErrors.slice(-20);
  results.preloadCounts = typeof window.protoBridge.counts === "function" ? window.protoBridge.counts() : null;
  results.rafFallbacks = rafFallbacks;
  window.protoBridge.results(results);
}

function specsX(b) {
  return Number.parseFloat(b.el.style.left);
}

function specsY(b) {
  return Number.parseFloat(b.el.style.top);
}

let active = null;
let resolveScenario = null;
let currentBoard = null;
let frameNo = 0;
let lastT = 0;
let shaderAnim = false;
let domAnim = false;
let geomEveryFrame = false;
let geomOk = true;
let paintTotal = 0;
const dirty = new Set();

cv.addEventListener("paint", (e) => {
  paintTotal += 1;
  const a = active;
  const elements = Array.from(e.changedElements || []);
  const rec = {
    t: round1(performance.now()),
    n: elements.length,
    board: false,
    shaderCanvas: false,
    drawableCount: 0,
    tags: [],
  };
  for (const el of elements) {
    const tag = el.tagName + (el.dataset && el.dataset.id ? `#${el.dataset.id}` : "") + (typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "");
    rec.tags.push(tag);
    if (el === currentBoard?.el) rec.board = true;
    if (el === currentBoard?.glc) rec.shaderCanvas = true;
    if (el.hasAttribute && el.hasAttribute("drawable")) rec.drawableCount += 1;
    if (a && currentBoard && el === currentBoard.el) dirty.add(el);
  }
  if (a) {
    a.paints += 1;
    if (rec.board) a.boardPaints += 1;
    if (rec.shaderCanvas) a.shaderPaints += 1;
    a.changedCounts.push(rec.n);
    if (a.paintRecords.length < 12) a.paintRecords.push(rec);
  }
});

function frame(t) {
  frameNo += 1;
  const a = active;
  if (a && lastT > 0) {
    const dt = t - lastT;
    if (dt > 0 && dt < 500) a.dts.push(dt);
  }
  lastT = t;
  if (a && currentBoard) {
    if (shaderAnim && currentBoard.gl && !currentBoard.gl.error) currentBoard.gl.draw((performance.now() - a.start) / 1000);
    if (domAnim) {
      const k = Math.floor((performance.now() - a.start) / 100);
      currentBoard.domEl.style.backgroundColor = k % 2 ? "#00ff00" : "#ff00ff";
    }
    if (geomEveryFrame && geomOk) {
      try {
        cv.updateElementGeometry(currentBoard.el, { canvasTransform: new DOMMatrix() });
      } catch (err) {
        geomOk = false;
        a.geomError = String(err);
      }
    }
  }
  if (a && dirty.size > 0) {
    for (const el of dirty) {
      if (el === currentBoard.el) {
        try {
          device.queue.drawElementImageToTexture({ source: el }, { texture: currentBoard.tex, size: { width: currentBoard.w, height: currentBoard.h } });
          device.queue.submit([]);
          a.uploads += 1;
          a.uploadFrames.push(frameNo);
        } catch (err) {
          a.uploadErrors = (a.uploadErrors || []).concat(String(err));
        }
      }
    }
    dirty.clear();
  }
  if (currentBoard) renderDisplay([currentBoard.bind]);
  else renderDisplay([]);
  if (a && t >= a.until) {
    active = null;
    const r = resolveScenario;
    resolveScenario = null;
    if (r) r();
  }
  requestAnimationFrame(frame);
}

function fpsFrom(dts) {
  const s = dts.slice(1).sort((x, y) => x - y);
  const n = s.length || 1;
  const mean = s.reduce((p, q) => p + q, 0) / n;
  return {
    frames: dts.length,
    avgFps: Math.round(1000 / Math.max(0.001, mean)),
    p50Ms: round1(s[Math.min(n - 1, Math.floor(0.5 * n))] || 0),
    p99Ms: round1(s[Math.min(n - 1, Math.floor(0.99 * n))] || 0),
  };
}

async function runScenario(spec) {
  const board = createBoard(spec);
  step(`scenario ${spec.name}: board created`);
  currentBoard = board;
  board.tex = createTex(board.w, board.h);
  board.bind = makeDisplayBind(board.tex, fitRect(board));
  if (geomOk) {
    try {
      cv.updateElementGeometry(board.el, { canvasTransform: new DOMMatrix() });
    } catch (err) {
      geomOk = false;
    }
  }
  cv.requestPaint();
  await waitFrames(6);
  step(`scenario ${spec.name}: requestPaint waited`);
  device.queue.drawElementImageToTexture({ source: board.el }, { texture: board.tex, size: { width: board.w, height: board.h } });
  device.queue.submit([]);
  await waitFrames(6);
  step(`scenario ${spec.name}: initial upload done`);
  const startPixels = {};
  for (const k of ["glLeft", "glRight", "dom"]) {
    startPixels[k] = await readPixelAt(board.tex, board.points[k][0], board.points[k][1]);
  }
  step(`scenario ${spec.name}: startPixels read`);
  const a = {
    name: spec.name,
    start: performance.now(),
    until: 0,
    dts: [],
    paints: 0,
    boardPaints: 0,
    shaderPaints: 0,
    changedCounts: [],
    paintRecords: [],
    uploads: 0,
    uploadFrames: [],
    glDrawStart: board.gl && !board.gl.error ? board.gl.drawCount : null,
  };
  a.until = performance.now() + spec.ms;
  shaderAnim = !!spec.shaderAnim;
  domAnim = !!spec.domAnim;
  geomEveryFrame = !!spec.geomEveryFrame;
  active = a;
  await new Promise((res) => {
    resolveScenario = res;
  });
  shaderAnim = false;
  domAnim = false;
  geomEveryFrame = false;
  await waitFrames(2);
  const endPixels = {};
  for (const k of ["glLeft", "glRight", "dom"]) {
    endPixels[k] = await readPixelAt(board.tex, board.points[k][0], board.points[k][1]);
  }
  const fps = fpsFrom(a.dts);
  const perFrame = a.uploads / Math.max(1, a.dts.length);
  const out = {
    name: spec.name,
    board: `${board.w}x${board.h}`,
    ms: spec.ms,
    shaderAnim: !!spec.shaderAnim,
    domAnim: !!spec.domAnim,
    geomEveryFrame: !!spec.geomEveryFrame,
    glOptions: board.glOptions,
    glDraws: board.gl && !board.gl.error ? board.gl.drawCount - a.glDrawStart : null,
    glLastTime: board.gl && !board.gl.error ? board.gl.lastTime : null,
    ...fps,
    paintEvents: a.paints,
    paintEventsWithBoard: a.boardPaints,
    paintEventsWithShaderCanvas: a.shaderPaints,
    changedCountsMax: a.changedCounts.length ? Math.max(...a.changedCounts) : 0,
    changedCountsSample: a.changedCounts.slice(0, 20),
    paintRecords: a.paintRecords,
    uploads: a.uploads,
    framesWithUploads: new Set(a.uploadFrames).size,
    uploadsPerFrame: round1(perFrame),
    bytesPerUpload: board.w * board.h * 4,
    bytesPerFrame: Math.round(perFrame * board.w * board.h * 4),
    startPixels,
    endPixels,
    textureChanged: JSON.stringify(startPixels) !== JSON.stringify(endPixels),
    uploadErrors: a.uploadErrors || [],
    geomError: a.geomError || null,
  };
  if (board.gl && !board.gl.error) board.gl.release();
  board.el.remove();
  board.tex.destroy();
  currentBoard = null;
  return out;
}

async function runTopLevelScenario(spec) {
  const out = { name: spec.name, layout: "shader canvas is an immediate child of the host canvas" };
  const cw = 210;
  const ch = 150;
  const board = createBoard({ id: "top-board", x: 20, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: false, title: "static board sibling" });
  const boardTex = createTex(board.w, board.h);
  const shaderEl = document.createElement("canvas");
  shaderEl.width = cw;
  shaderEl.height = ch;
  shaderEl.setAttribute("drawable", "");
  shaderEl.dataset.id = "top-shader";
  shaderEl.style.cssText = `position:absolute;left:520px;top:20px;width:${cw}px;height:${ch}px`;
  cv.appendChild(shaderEl);
  const gl = makeGl(shaderEl, { alpha: true, preserveDrawingBuffer: false });
  const shaderTex = createTex(cw, ch);
  out.glError = gl.error ?? null;
  if (!gl.error) gl.draw(0);
  cv.requestPaint();
  try {
    cv.updateElementGeometry(board.el, { canvasTransform: new DOMMatrix() });
    cv.updateElementGeometry(shaderEl, { canvasTransform: new DOMMatrix() });
    out.geometry = true;
  } catch (err) {
    out.geometry = String(err);
  }
  await waitFrames(6);
  device.queue.drawElementImageToTexture({ source: board.el }, { texture: boardTex, size: { width: board.w, height: board.h } });
  device.queue.drawElementImageToTexture({ source: shaderEl }, { texture: shaderTex, size: { width: cw, height: ch } });
  device.queue.submit([]);
  await waitFrames(6);
  const startBoard = await readPixelAt(boardTex, board.points.dom[0], board.points.dom[1]);
  const startShader = await readPixelAt(shaderTex, cw * 0.75, ch * 0.5);
  const startSig = await shaderSignature(shaderTex, cw, ch);
  const counters = { paints: 0, boardPaints: 0, shaderPaints: 0, boardUploads: 0, shaderUploads: 0, changedCounts: [], records: [], dts: [], uploadErrors: [] };
  const dirty = new Set();
  const onPaint = (e) => {
    counters.paints += 1;
    const els = Array.from(e.changedElements || []);
    counters.changedCounts.push(els.length);
    let hasBoard = false;
    let hasShader = false;
    for (const el of els) {
      if (el === board.el) {
        hasBoard = true;
        dirty.add(el);
      } else if (el === shaderEl) {
        hasShader = true;
        dirty.add(el);
      }
    }
    if (hasBoard) counters.boardPaints += 1;
    if (hasShader) counters.shaderPaints += 1;
    if (counters.records.length < 12) {
      counters.records.push({ n: els.length, board: hasBoard, shader: hasShader, tags: els.map((el) => `${el.tagName}${el.dataset && el.dataset.id ? `#${el.dataset.id}` : ""}`) });
    }
  };
  cv.addEventListener("paint", onPaint);
  const t0 = performance.now();
  let last = 0;
  let glDraws = 0;
  let midPromise = null;
  await new Promise((resolve) => {
    const tick = (t) => {
      if (last > 0 && t - last > 0 && t - last < 500) counters.dts.push(t - last);
      last = t;
      if (!gl.error) {
        gl.draw((performance.now() - t0) / 1000);
        glDraws += 1;
      }
      if (dirty.size > 0) {
        for (const el of dirty) {
          try {
            if (el === board.el) {
              device.queue.drawElementImageToTexture({ source: el }, { texture: boardTex, size: { width: board.w, height: board.h } });
              counters.boardUploads += 1;
            } else if (el === shaderEl) {
              device.queue.drawElementImageToTexture({ source: el }, { texture: shaderTex, size: { width: cw, height: ch } });
              counters.shaderUploads += 1;
            }
            device.queue.submit([]);
          } catch (err) {
            counters.uploadErrors.push(String(err));
          }
        }
        dirty.clear();
      }
      if (!midPromise && performance.now() - t0 >= spec.ms / 2) midPromise = shaderSignature(shaderTex, cw, ch);
      if (performance.now() - t0 >= spec.ms) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  cv.removeEventListener("paint", onPaint);
  await waitFrames(2);
  const endBoard = await readPixelAt(boardTex, board.points.dom[0], board.points.dom[1]);
  const endShader = await readPixelAt(shaderTex, cw * 0.75, ch * 0.5);
  const endSig = await shaderSignature(shaderTex, cw, ch);
  const midSig = midPromise ? await midPromise : null;
  const fps = fpsFrom(counters.dts);
  const uploads = counters.boardUploads + counters.shaderUploads;
  Object.assign(out, {
    ...fps,
    glDraws,
    paintEvents: counters.paints,
    paintEventsWithBoard: counters.boardPaints,
    paintEventsWithShaderCanvas: counters.shaderPaints,
    changedCountsMax: counters.changedCounts.length ? Math.max(...counters.changedCounts) : 0,
    changedCountsSample: counters.changedCounts.slice(0, 20),
    paintRecords: counters.records,
    boardUploads: counters.boardUploads,
    shaderUploads: counters.shaderUploads,
    uploads,
    uploadsPerFrame: round1(uploads / Math.max(1, counters.dts.length)),
    boardBytesPerUpload: board.w * board.h * 4,
    shaderBytesPerUpload: cw * ch * 4,
    bytesPerFrame: Math.round((counters.boardUploads * board.w * board.h * 4 + counters.shaderUploads * cw * ch * 4) / Math.max(1, counters.dts.length)),
    startBoard,
    endBoard,
    startShader,
    endShader,
    startSignature: startSig,
    midSignature: midSig,
    endSignature: endSig,
    shaderTextureChangedStartToMid: midSig ? JSON.stringify(startSig) !== JSON.stringify(midSig) : null,
    shaderTextureChangedStartToEnd: JSON.stringify(startSig) !== JSON.stringify(endSig),
    boardTextureChanged: JSON.stringify(startBoard) !== JSON.stringify(endBoard),
    uploadErrors: counters.uploadErrors,
  });
  if (!gl.error) gl.release();
  shaderEl.remove();
  board.el.remove();
  boardTex.destroy();
  shaderTex.destroy();
  return out;
}

const animSpecs = [
  { name: "shader-static", id: "anim-static", x: 20, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: true, preserveDrawingBuffer: false }, title: "shader static", ms: 2500 },
  { name: "shader-anim", id: "anim-anim", x: 20, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: true, preserveDrawingBuffer: false }, title: "shader anim", ms: 3000, shaderAnim: true },
  { name: "shader-anim-preserve", id: "anim-preserve", x: 20, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: { alpha: true, preserveDrawingBuffer: true }, title: "shader anim preserve", ms: 2500, shaderAnim: true },
  { name: "dom-anim", id: "anim-dom", x: 20, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: false, title: "dom anim", ms: 2500, domAnim: true },
  { name: "geom-only", id: "anim-geom", x: 20, y: 20, w: SMALL_W, h: SMALL_H, layout: smallLayout, gl: false, title: "geometry only", ms: 2500, geomEveryFrame: true },
  { name: "large-shader-static", id: "anim-large-static", x: 20, y: 20, w: LARGE_W, h: LARGE_H, layout: largeLayout, gl: { alpha: true, preserveDrawingBuffer: false }, title: "large shader static", extraNodes: 24, ms: 2500 },
  { name: "large-shader-anim", id: "anim-large-anim", x: 20, y: 20, w: LARGE_W, h: LARGE_H, layout: largeLayout, gl: { alpha: true, preserveDrawingBuffer: false }, title: "large shader anim", extraNodes: 24, ms: 4000, shaderAnim: true },
];

async function runAnim() {
  results.env = { ...results.env, ...(await envReport()) };
  requestAnimationFrame(frame);
  results.scenarios.list = [];
  for (const spec of animSpecs) {
    hud(`running ${spec.name}`);
    const r = await runScenario(spec);
    results.scenarios.list.push(r);
  }
  hud("running top-level-shader-anim");
  results.scenarios.topLevel = await runTopLevelScenario({ name: "top-level-shader-anim", ms: 3000 });
  await waitFrames(2);
  await window.protoBridge.shot("shader-anim-final");
  results.paintTotal = paintTotal;
  results.gpuErrors = gpuErrors.slice(-20);
  results.geomOk = geomOk;
  results.preloadCounts = typeof window.protoBridge.counts === "function" ? window.protoBridge.counts() : null;
  results.rafFallbacks = rafFallbacks;
  window.protoBridge.results(results);
}

window.addEventListener("error", (e) => results.errors.push(`pageerror: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => results.errors.push(`unhandledrejection: ${String(e.reason)}`));

async function main() {
  try {
    await initGpu();
  } catch (err) {
    results.fatal = String(err);
    hud(`init failed: ${err.message}`);
    window.protoBridge.results(results);
    return;
  }
  try {
    if (MODE === "shader-anim") await runAnim();
    else await runCapture();
  } catch (err) {
    results.fatal = String(err);
    results.errors.push(String(err?.stack || err));
    window.protoBridge.results(results);
  }
}

window.addEventListener("DOMContentLoaded", main);
