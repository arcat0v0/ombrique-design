export class UploadQueue {
  private pending = new Set<Element>();
  private initialDone = false;
  private initialMs: number | null = null;

  markDirty(el: Element): boolean {
    if (this.pending.has(el)) return false;
    this.pending.add(el);
    return true;
  }

  takeAll(): Element[] {
    const els = Array.from(this.pending);
    this.pending.clear();
    return els;
  }

  get size(): number {
    return this.pending.size;
  }

  get isInitialDone(): boolean {
    return this.initialDone;
  }

  get initialUploadMs(): number | null {
    return this.initialMs;
  }

  completeInitial(ms: number): void {
    if (this.initialDone) return;
    this.initialDone = true;
    this.initialMs = ms;
  }
}
