async function run() {
  const out = { ua: navigator.userAgent };
  const chromeMatch = navigator.userAgent.match(/Chrome\/(\d+)/);
  out.chromeMajor = chromeMatch ? Number(chromeMatch[1]) : null;

  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  c.content = "drawable";
  c.style.cssText = "position:fixed;left:-64px;top:0;width:8px;height:8px";
  const inner = document.createElement("div");
  inner.setAttribute("drawable", "");
  inner.style.cssText = "width:8px;height:8px;background:#fff";
  c.appendChild(inner);
  document.body.appendChild(c);
  c.getContext("2d");
  out.canvasContentAttr = c.content;
  out.layoutsubtreeAttr = c.hasAttribute("layoutsubtree");
  out.hasOnpaint = "onpaint" in HTMLCanvasElement.prototype;
  out.hasRequestPaint = typeof c.requestPaint === "function";
  out.hasCaptureElementImage = typeof c.captureElementImage === "function";
  out.hasUpdateElementGeometry = typeof c.updateElementGeometry === "function";
  out.hasGetElementTransform = typeof c.getElementTransform === "function";
  out.gpuBinding = typeof navigator.gpu !== "undefined";

  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        out.adapter = null;
      } else {
        out.adapter = adapter.info ? { ...adapter.info } : "no info object";
        const device = await adapter.requestDevice();
        out.maxTextureDimension2D = device.limits.maxTextureDimension2D;
        out.queueDrawElementImageToTexture = typeof device.queue.drawElementImageToTexture === "function";
        const errors = [];
        device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const format of ["rgba8unorm", "bgra8unorm"]) {
          errors.length = 0;
          const tex = device.createTexture({
            size: [8, 8],
            format,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
          });
          try {
            device.queue.drawElementImageToTexture({ source: inner }, { texture: tex, size: { width: 8, height: 8 } });
            device.queue.submit([]);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            out[`upload_${format}`] = errors.length === 0 ? "ok" : `error: ${errors[0]}`;
          } catch (err) {
            out[`upload_${format}`] = `threw: ${err.message}`;
          }
          tex.destroy();
        }
      }
    } catch (err) {
      out.adapterError = String(err);
    }
  }
  await new Promise((r) => setTimeout(r, 100));
  window.protoBridge.reportProbe(out);
}

window.addEventListener("DOMContentLoaded", run);
