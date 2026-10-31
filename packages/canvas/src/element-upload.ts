export interface ElementImageUploadDestination {
  texture: GPUTexture;
  size: { width: number; height: number };
}

export interface ElementImageUpload {
  (
    source: { source: Element },
    destination: ElementImageUploadDestination,
  ): void;
  readonly canResample: boolean;
}

export function resolveElementImageUpload(queue: GPUQueue): ElementImageUpload {
  if (typeof queue.drawElementImageToTexture === "function") {
    const draw = queue.drawElementImageToTexture.bind(queue);
    const upload = ((
      source: { source: Element },
      destination: ElementImageUploadDestination,
    ) => {
      draw(source, {
        texture: destination.texture,
        size: destination.size,
      });
    }) as ElementImageUpload;
    Object.defineProperty(upload, "canResample", { value: true });
    return upload;
  }
  if (typeof queue.copyElementImageToTexture === "function") {
    const copy = queue.copyElementImageToTexture.bind(queue);
    const upload = ((
      source: { source: Element },
      destination: ElementImageUploadDestination,
    ) => {
      copy(source, {
        destination: { texture: destination.texture },
        size: destination.size,
      });
    }) as ElementImageUpload;
    Object.defineProperty(upload, "canResample", { value: false });
    return upload;
  }
  throw new Error(
    "WebGPU element image upload is unavailable: neither drawElementImageToTexture nor copyElementImageToTexture exists",
  );
}
