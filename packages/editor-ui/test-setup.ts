class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MockDOMRect {
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  top = 0;
  right = 0;
  bottom = 0;
  left = 0;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.top = y;
    this.right = x + width;
    this.bottom = y + height;
    this.left = x;
  }

  toJSON() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      top: this.top,
      right: this.right,
      bottom: this.bottom,
      left: this.left,
    };
  }
}

if (typeof window !== "undefined") {
  window.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
  window.DOMRect = MockDOMRect as unknown as typeof DOMRect;
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
global.DOMRect = MockDOMRect as unknown as typeof DOMRect;
