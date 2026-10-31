import { describe, expect, it, vi } from "vitest";
import { resolveElementImageUpload } from "./element-upload";

describe("resolveElementImageUpload", () => {
  it("prefers drawElementImageToTexture and resamples destination", () => {
    const copy = vi.fn();
    const legacy = vi.fn();
    const queue = {
      copyElementImageToTexture: copy,
      drawElementImageToTexture: legacy,
    } as unknown as GPUQueue;
    const upload = resolveElementImageUpload(queue);
    const texture = {} as GPUTexture;
    upload(
      { source: {} as Element },
      { texture, size: { width: 16, height: 16 } },
    );
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(upload.canResample).toBe(true);
  });

  it("falls back to copyElementImageToTexture with destination size rule", () => {
    const copy = vi.fn();
    const queue = {
      copyElementImageToTexture: copy,
    } as unknown as GPUQueue;
    const upload = resolveElementImageUpload(queue);
    const texture = {} as GPUTexture;
    upload(
      { source: {} as Element },
      { texture, size: { width: 8, height: 8 } },
    );
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith(
      { source: expect.any(Object) },
      { destination: { texture }, size: { width: 8, height: 8 } },
    );
    expect(upload.canResample).toBe(false);
  });

  it("binds the queue as this for the upload call", () => {
    let receiver: unknown = null;
    const queue = {
      drawElementImageToTexture(this: unknown) {
        receiver = this;
      },
    } as unknown as GPUQueue;
    const upload = resolveElementImageUpload(queue);
    upload(
      { source: {} as Element },
      { texture: {} as GPUTexture, size: { width: 8, height: 8 } },
    );
    expect(receiver).toBe(queue);
  });

  it("throws a descriptive error when neither API exists", () => {
    const queue = {} as GPUQueue;
    expect(() => resolveElementImageUpload(queue)).toThrow(
      /element image upload/i,
    );
  });
});
