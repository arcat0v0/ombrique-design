class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined") {
  window.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
