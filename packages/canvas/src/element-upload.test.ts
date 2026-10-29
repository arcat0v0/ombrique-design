import { describe, expect, it, vi } from "vitest";
import { resolveElementImageUpload } from "./element-upload";

describe("resolveElementImageUpload", () => {
  it("prefers copyElementImageToTexture and maps the destination", () => {
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
      { texture, size: { width: 8, height: 8 } },
    );
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith(
      { source: expect.any(Object) },
      { destination: { texture }, size: { width: 8, height: 8 } },
    );
    expect(legacy).not.toHaveBeenCalled();
  });

  it("falls back to legacy drawElementImageToTexture unchanged", () => {
    const legacy = vi.fn();
    const queue = {
      drawElementImageToTexture: legacy,
    } as unknown as GPUQueue;
    const upload = resolveElementImageUpload(queue);
    const texture = {} as GPUTexture;
    upload(
      { source: {} as Element },
      { texture, size: { width: 8, height: 8 } },
    );
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenCalledWith(
      { source: expect.any(Object) },
      { texture, size: { width: 8, height: 8 } },
    );
  });

  it("binds the queue as this for the upload call", () => {
    let receiver: unknown = null;
    const queue = {
      copyElementImageToTexture(this: unknown) {
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
