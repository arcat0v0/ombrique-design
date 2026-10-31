interface ElementImage {
  readonly width: number;
  readonly height: number;
  close?(): void;
}

interface HTMLCanvasElement {
  content: string;
  requestPaint(): void;
  updateElementGeometry(
    element: Element,
    geometry: { canvasTransform?: DOMMatrix },
  ): void;
  captureElementImage?(element: Element): ElementImage;
}

interface HTMLElementEventMap {
  paint: PaintEvent;
}

interface PaintEvent extends Event {
  changedElements: Element[];
}

interface GPUQueue {
  copyElementImageToTexture?(
    source: { source: Element | ElementImage },
    destination: {
      destination: { texture: GPUTexture };
      size?: { width: number; height: number };
    },
  ): void;
  drawElementImageToTexture?(
    source: { source: Element | ElementImage },
    destination: {
      texture: GPUTexture;
      size: { width: number; height: number };
    },
  ): void;
}
