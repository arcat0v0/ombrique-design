const COLS = 20;
const ROWS = 25;
const BW = 720;
const BH = 540;
const GAP = 60;
const AUTO = new URLSearchParams(location.search).has("auto");

const cv = document.getElementById("cv");
const hudText = document.getElementById("hudText");

const results = { scenarios: {} };
const gpuErrors = [];

if (cv.content !== "drawable") cv.setAttribute("layoutsubtree", "");

const boards = [];
const frag = [];
for (let i = 0; i < COLS * ROWS; i += 1) {
  const x = (i % COLS) * (BW + GAP);
  const y = Math.floor(i / COLS) * (BH + GAP);
  const hue = (i * 47) % 360;
  frag.push(
    `<section class="board" drawable data-i="${i}" style="left:${x}px;top:${y}px;--accent:hsl(${hue} 70% 55%)">` +
      `<header><h2>Board ${i}</h2><span class="badge">${i}</span></header>` +
      `<p class="line" style="width:${((i * 37) % 400) + 240}px">The quick brown fox jumps over the lazy dog 0123456789</p>` +
      `<p class="line" style="width:${((i * 91) % 380) + 200}px">Sphinx of black quartz, judge my vow.</p>` +
      `<div class="bar"></div>` +
      `<div class="cards">` +
      `<div class="card" style="--h:${40 + ((i * 13) % 90)}">alpha</div>` +
      `<div class="card" style="--h:${40 + ((i * 29) % 90)}">beta</div>` +
      `<div class="card" style="--h:${40 + ((i * 7) % 90)}">gamma</div>` +
      `</div></section>`,
  );
  boards.push({ i, x, y, el: null, tex: null, ubo: null, bind: null, texW: BW, texH: BH });
}
cv.innerHTML = frag.join("");
const els = cv.querySelectorAll(".board");
boards.forEach((b, k) => {
  b.el = els[k];
});

const cam = { x: 0, y: 0, z: 1 };
let cssW = innerWidth;
let cssH = innerHeight;
let dpr = devicePixelRatio || 1;
let device = null;
let ctx = null;
let canvasFormat = "";
let uploadFormat = "";
let adapterInfo = "";
let sampler = null;
let pipeline = null;
let camUbo = null;
const camArr = new Float32Array(8);

const stats = { paints: 0, uploads: 0, lastChanged: -1, latencies: [], initialUploadMs: 0 };
const pending = new Set();
let pendingMut = null;
let initialDone = false;
let geometryApiOk = null;

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

async function waitFrames(n) {
  for (let k = 0; k < n; k += 1) await new Promise(requestAnimationFrame);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

async function detectUploadFormat() {
  const test = document.createElement("canvas");
  test.width = 8;
  test.height = 8;
  test.content = "drawable";
  test.style.cssText = "position:fixed;left:-64px;top:0;width:8px;height:8px";
  const inner = document.createElement("div");
  inner.setAttribute("drawable", "");
  inner.style.cssText = "width:8px;height:8px;background:#fff";
  test.appendChild(inner);
  document.body.appendChild(test);
  test.getContext("2d");
  await waitFrames(3);
  for (const format of ["rgba8unorm", "bgra8unorm"]) {
    gpuErrors.length = 0;
    const tex = device.createTexture({
      size: [8, 8],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.drawElementImageToTexture({ source: inner }, { texture: tex, size: { width: 8, height: 8 } });
    device.queue.submit([]);
    await waitFrames(2);
    tex.destroy();
    if (gpuErrors.length === 0) {
      test.remove();
      return format;
    }
  }
  test.remove();
  throw new Error(`drawElementImageToTexture failed on all formats: ${gpuErrors.join("; ")}`);
}

function bindFor(b, texture) {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: { buffer: b.ubo } },
      { binding: 3, resource: { buffer: camUbo } },
    ],
  });
}

async function initGpu() {
  if (typeof navigator.gpu === "undefined") throw new Error("navigator.gpu unavailable");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("requestAdapter returned null");
  adapterInfo = adapter.info ? `${adapter.info.vendor} ${adapter.info.architecture}` : "";
  device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (e) => {
    gpuErrors.push(e.error.message);
  });
  ctx = cv.getContext("webgpu");
  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: canvasFormat, alphaMode: "opaque" });
  uploadFormat = await detectUploadFormat();

  sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const module = device.createShaderModule({ code: WGSL });
  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format: canvasFormat }] },
    primitive: { topology: "triangle-list" },
  });
  camUbo = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  for (const b of boards) {
    b.tex = device.createTexture({
      size: [BW, BH],
      format: uploadFormat,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    b.ubo = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b.ubo, 0, new Float32Array([b.x, b.y, BW, BH]));
    b.bind = bindFor(b, b.tex);
  }
}

function uploadEl(el) {
  const b = boards[Number(el.dataset.i)];
  device.queue.drawElementImageToTexture(
    { source: el },
    { texture: b.tex, size: { width: b.texW, height: b.texH } },
  );
  stats.uploads += 1;
}

cv.addEventListener("paint", (e) => {
  stats.paints += 1;
  const changed = e.changedElements.length;
  stats.lastChanged = changed;
  if (pendingMut !== null && changed > 0) {
    stats.latencies.push(round1(performance.now() - pendingMut));
    pendingMut = null;
  }
  for (const el of e.changedElements) pending.add(el);
});

const samples = [];
let lastT = 0;
let fpsEma = 0;
let collectUntil = 0;

function frame(t) {
  if (lastT > 0) {
    const dt = t - lastT;
    if (dt > 0 && dt < 500) {
      fpsEma = fpsEma === 0 ? 1000 / dt : fpsEma * 0.93 + (1000 / dt) * 0.07;
      if (performance.now() < collectUntil) samples.push(dt);
    }
  }
  lastT = t;

  if (pending.size > 0) {
    const t0 = performance.now();
    for (const el of pending) uploadEl(el);
    pending.clear();
    if (!initialDone) {
      stats.initialUploadMs = performance.now() - t0;
      initialDone = true;
    }
  }

  camArr[0] = cam.z;
  camArr[1] = cam.x;
  camArr[2] = cam.y;
  camArr[3] = dpr;
  camArr[4] = cv.width;
  camArr[5] = cv.height;
  device.queue.writeBuffer(camUbo, 0, camArr);

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
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
  let visible = 0;
  for (const b of boards) {
    const sx = (b.x - cam.x) * cam.z;
    const sy = (b.y - cam.y) * cam.z;
    const dw = BW * cam.z;
    const dh = BH * cam.z;
    if (sx >= cssW || sy >= cssH || sx + dw <= 0 || sy + dh <= 0) continue;
    pass.setBindGroup(0, b.bind);
    pass.draw(6);
    visible += 1;
  }
  pass.end();
  device.queue.submit([encoder.finish()]);

  if (geometryApiOk !== false) {
    try {
      const mtx = new DOMMatrix();
      for (const b of boards) {
        const sx = (b.x - cam.x) * cam.z;
        const sy = (b.y - cam.y) * cam.z;
        if (sx >= cssW || sy >= cssH || sx + BW * cam.z <= 0 || sy + BH * cam.z <= 0) continue;
        mtx.a = cam.z;
        mtx.d = cam.z;
        mtx.e = sx;
        mtx.f = sy;
        cv.updateElementGeometry(b.el, { canvasTransform: mtx });
      }
      geometryApiOk = true;
    } catch {
      geometryApiOk = false;
    }
  }

  hudText.textContent =
    `fps ${Math.round(fpsEma)}  zoom ${(cam.z * 100).toFixed(0)}%  visible ${visible}/${boards.length}\n` +
    `paints ${stats.paints}  lastChanged ${stats.lastChanged}  uploads ${stats.uploads}  pending ${pending.size}\n` +
    `adapter ${adapterInfo || "?"}  tex ${uploadFormat || "?"}  ${geometryApiOk === false ? "geomApi:failed" : "geomApi:ok"}`;

  requestAnimationFrame(frame);
}

function collectFps(ms) {
  samples.length = 0;
  collectUntil = performance.now() + ms;
  return new Promise((resolve) => {
    setTimeout(function check() {
      if (performance.now() >= collectUntil) {
        const s = samples.slice(1).sort((a, b) => a - b);
        const n = s.length || 1;
        const q = (f) => round1(s[Math.min(n - 1, Math.floor(f * n))]);
        const avg = s.reduce((a, b) => a + b, 0) / n;
        resolve({ frames: s.length, avgFps: Math.round(1000 / avg), p1Ms: q(0.01), p50Ms: q(0.5), p99Ms: q(0.99) });
      } else {
        setTimeout(check, 50);
      }
    }, Math.max(50, ms / 4));
  });
}

function animate(ms, step) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    function tick(t) {
      const p = Math.min(1, (t - t0) / ms);
      step(p);
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

async function shot(name) {
  await waitFrames(2);
  await window.protoBridge.shot(name);
}

async function sharpnessRect(texture, texW, texH, rx, ry, rw, rh) {
  const bpr = Math.ceil((texW * 4) / 256) * 256;
  const buf = device.createBuffer({ size: bpr * texH, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture }, { buffer: buf, bytesPerRow: bpr, rowsPerImage: texH }, [texW, texH]);
  device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const px = new Uint8Array(buf.getMappedRange());
  const laps = [];
  for (let y = 1; y < rh - 1; y += 1) {
    const row = (ry + y) * bpr;
    for (let x = 1; x < rw - 1; x += 1) {
      const o = row + (rx + x) * 4;
      const c = px[o] + 2 * px[o + 1] + px[o + 2];
      const lap =
        4 * c -
        (px[o - 4] + 2 * px[o - 3] + px[o - 2]) -
        (px[o + 4] + 2 * px[o + 5] + px[o + 6]) -
        (px[o - bpr] + 2 * px[o - bpr + 1] + px[o - bpr + 2]) -
        (px[o + bpr] + 2 * px[o + bpr + 1] + px[o + bpr + 2]);
      laps.push(Math.abs(lap));
    }
  }
  buf.unmap();
  buf.destroy();
  laps.sort((a, b) => b - a);
  const n = laps.length;
  const mean = laps.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(laps.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { sigma: round1(sigma), p999: Math.round(laps[Math.floor(n * 0.001)]) };
}

function hudNote(msg) {
  hudText.textContent = `${msg}\n${hudText.textContent.split("\n").slice(1).join("\n")}`;
}

async function runScenarios() {
  const S = results.scenarios;
  hudNote("waiting for initial paint…");
  cv.requestPaint();
  await waitFrames(5);
  S.initialUpload = {
    boards: boards.length,
    paintEvents: stats.paints,
    uploads: stats.uploads,
    cpuSubmitMs: round1(stats.initialUploadMs),
  };
  await shot("01-overview");

  S.baseline = await collectFps(3000);
  hudNote("pan…");
  const paintsBeforePan = stats.paints;
  const uploadsBeforePan = stats.uploads;
  const panFps = collectFps(8000);
  await animate(8000, (p) => {
    cam.x = p * (COLS * (BW + GAP) - cssW);
    cam.z = 1;
  });
  S.pan = { ...(await panFps), paintEventsDelta: stats.paints - paintsBeforePan, uploadsDelta: stats.uploads - uploadsBeforePan };
  await shot("02-pan-end");

  hudNote("zoom…");
  const paintsBeforeZoom = stats.paints;
  const zoomFps = collectFps(9000);
  await animate(2500, (p) => {
    cam.z = 1 * 10 ** (-1.3 * p);
    cam.x = 3 * (BW + GAP);
    cam.y = 3 * (BH + GAP);
  });
  cam.z = 10 ** -1.3;
  await shot("03-zoomed-out");
  await animate(1500, () => {});
  await animate(2500, (p) => {
    cam.z = 10 ** (-1.3 * (1 - p));
  });
  cam.z = 1;
  S.zoom = { ...(await zoomFps), paintEventsDelta: stats.paints - paintsBeforeZoom };

  hudNote("style mutation latency…");
  const h2 = boards[7].el.querySelector("h2");
  const changedCounts = [];
  for (let k = 0; k < 10; k += 1) {
    await waitFrames(2);
    pendingMut = performance.now();
    h2.style.background = k % 2 ? "rgb(23 23 28)" : "hsl(210 90% 60%)";
    await waitFrames(3);
    changedCounts.push(stats.lastChanged);
  }
  S.styleMutation = { latenciesMs: stats.latencies, changedElementsPerPaint: changedCounts, paintEvents: stats.paints };

  hudNote("hi-res re-raster test…");
  const tb = boards[12 * COLS + 10];
  cam.z = 8;
  cam.x = tb.x + 180 - cssW / 2 / cam.z;
  cam.y = tb.y + 50 - cssH / 2 / cam.z;
  await waitFrames(4);
  await shot("04-zoom800-basetex");
  const hiW = Math.min(BW * 8, device.limits.maxTextureDimension2D);
  const hiH = Math.min(BH * 8, device.limits.maxTextureDimension2D);
  const hiTex = device.createTexture({
    size: [hiW, hiH],
    format: uploadFormat,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const t0 = performance.now();
  device.queue.drawElementImageToTexture({ source: tb.el }, { texture: hiTex, size: { width: hiW, height: hiH } });
  device.queue.submit([]);
  const hiSubmitMs = round1(performance.now() - t0);
  const baseBind = tb.bind;
  tb.texW = hiW;
  tb.texH = hiH;
  tb.bind = bindFor(tb, hiTex);
  device.queue.writeBuffer(tb.ubo, 0, new Float32Array([tb.x, tb.y, BW, BH]));
  await waitFrames(4);
  await shot("05-zoom800-hires");
  const vw = cssW / 8;
  const vh = cssH / 8;
  const fx = Math.max(2, Math.round(180 - vw / 2));
  const fy = Math.max(2, Math.round(50 - vh / 2));
  const sharpBase = await sharpnessRect(tb.tex, BW, BH, fx, fy, Math.round(vw), Math.round(vh));
  const sharpHi = await sharpnessRect(hiTex, hiW, hiH, fx * 8, fy * 8, Math.round(vw) * 8, Math.round(vh) * 8);
  tb.bind = baseBind;
  tb.texW = BW;
  tb.texH = BH;
  hiTex.destroy();
  S.hiRes = {
    hiTexture: `${hiW}x${hiH}`,
    uploadSubmitMs: hiSubmitMs,
    sharp_base720_sameWorldRegion: sharpBase,
    sharp_hires_sameWorldRegion: sharpHi,
    p999Ratio: round1(sharpHi.p999 / Math.max(1, sharpBase.p999)),
  };

  window.protoBridge.askIsolated();

  results.env = {
    chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1],
    adapter: adapterInfo,
    canvasFormat,
    uploadFormat,
    maxTextureDimension2D: device.limits.maxTextureDimension2D,
    cssViewport: `${cssW}x${cssH}`,
    dpr,
    boards: boards.length,
    world: `${COLS * (BW + GAP)}x${ROWS * (BH + GAP)}`,
    updateElementGeometry: geometryApiOk,
    gpuErrors: gpuErrors.slice(-5),
  };
}

let drag = null;
window.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  cam.x -= (e.clientX - drag.x) / cam.z;
  cam.y -= (e.clientY - drag.y) / cam.z;
  drag = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointerup", () => {
  drag = null;
});
window.addEventListener("wheel", (e) => {
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0015);
  const wx = cam.x + e.clientX / cam.z;
  const wy = cam.y + e.clientY / cam.z;
  cam.z = Math.min(32, Math.max(0.05, cam.z * f));
  cam.x = wx - e.clientX / cam.z;
  cam.y = wy - e.clientY / cam.z;
}, { passive: false });

new ResizeObserver((entries) => {
  const entry = entries[0];
  if (entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize.length > 0) {
    cv.width = entry.devicePixelContentBoxSize[0].inlineSize;
    cv.height = entry.devicePixelContentBoxSize[0].blockSize;
    dpr = cv.width / Math.max(1, entry.contentRect.width);
  } else {
    dpr = devicePixelRatio || 1;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
  }
  cssW = innerWidth;
  cssH = innerHeight;
}).observe(cv, { box: "device-pixel-content-box" });

window.addEventListener("error", (e) => console.log(`pageerror: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => console.log(`unhandledrejection: ${e.reason}`));

async function main() {
  try {
    await initGpu();
  } catch (err) {
    hudText.textContent = `WebGPU/HTML-in-Canvas init failed:\n${err.message}`;
    console.log(`init failed: ${err.message}`);
    if (AUTO) window.protoBridge.results({ fatal: err.message, env: { chrome: navigator.userAgent } });
    return;
  }
  requestAnimationFrame(frame);
  cv.requestPaint();
  if (AUTO) {
    await runScenarios();
    results.paintsTotal = stats.paints;
    results.uploadsTotal = stats.uploads;
    window.protoBridge.results(results);
  } else {
    hudNote("manual: drag = pan, wheel = zoom");
  }
}

main();
