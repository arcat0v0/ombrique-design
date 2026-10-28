import { describe, expect, it } from "vitest";
import { UploadQueue } from "./uploadQueue";

describe("UploadQueue", () => {
  it("deduplicates markDirty", () => {
    const q = new UploadQueue();
    const a = {} as Element;
    expect(q.markDirty(a)).toBe(true);
    expect(q.markDirty(a)).toBe(false);
    expect(q.size).toBe(1);
  });

  it("takeAll returns pending elements and clears the set", () => {
    const q = new UploadQueue();
    const a = {} as Element;
    const b = {} as Element;
    q.markDirty(a);
    q.markDirty(b);
    q.markDirty(a);
    const taken = q.takeAll();
    expect(taken).toHaveLength(2);
    expect(taken).toContain(a);
    expect(taken).toContain(b);
    expect(q.size).toBe(0);
    expect(q.takeAll()).toEqual([]);
  });

  it("tracks initial completion once with elapsed ms", () => {
    const q = new UploadQueue();
    expect(q.isInitialDone).toBe(false);
    expect(q.initialUploadMs).toBeNull();
    q.completeInitial(12.5);
    expect(q.isInitialDone).toBe(true);
    expect(q.initialUploadMs).toBe(12.5);
    q.completeInitial(99);
    expect(q.initialUploadMs).toBe(12.5);
  });
});
