interface HTMLCanvasElement {
  content: string;
  requestPaint(): void;
  updateElementGeometry(
    element: Element,
    geometry: { canvasTransform?: DOMMatrix },
  ): void;
}

interface HTMLElementEventMap {
  paint: PaintEvent;
}

interface PaintEvent extends Event {
  changedElements: Element[];
}

interface GPUQueue {
  copyElementImageToTexture?(
    source: { source: Element },
    destination: {
      destination: { texture: GPUTexture };
      size?: { width: number; height: number };
    },
  ): void;
  drawElementImageToTexture?(
    source: { source: Element },
    destination: {
      texture: GPUTexture;
      size: { width: number; height: number };
    },
  ): void;
}
