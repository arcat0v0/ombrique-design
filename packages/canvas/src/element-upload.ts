export interface ElementImageUploadDestination {
  texture: GPUTexture;
  size: { width: number; height: number };
}

export type ElementImageUpload = (
  source: { source: Element },
  destination: ElementImageUploadDestination,
) => void;

export function resolveElementImageUpload(queue: GPUQueue): ElementImageUpload {
  if (typeof queue.copyElementImageToTexture === "function") {
    const copy = queue.copyElementImageToTexture.bind(queue);
    return (source, destination) =>
      copy(source, {
        destination: { texture: destination.texture },
        size: destination.size,
      });
  }
  if (typeof queue.drawElementImageToTexture === "function")
    return queue.drawElementImageToTexture.bind(queue);
  throw new Error(
    "WebGPU element image upload is unavailable: neither copyElementImageToTexture nor drawElementImageToTexture exists",
  );
}
