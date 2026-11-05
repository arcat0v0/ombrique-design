export interface HandleRecord {
  file: string;
  path: number[];
  tag: string;
  dataName: string | null;
  fragmentHash: string;
}

export class HandleLimitError extends Error {
  readonly code = "handle_limit";

  constructor(maxHandles: number, required: number) {
    super(
      `single-page handle limit reached (${maxHandles}); this read needs ${required} handles. Re-reading the same page cannot help. Reduce the page size, split the page into smaller pages, or start a new session.`,
    );
    this.name = "HandleLimitError";
  }
}

export class HandleRegistry {
  private records = new Map<string, HandleRecord>();
  private readonly maxHandles: number;
  private counter = 0;

  constructor(maxHandles = 2000) {
    this.maxHandles = maxHandles;
  }

  get size(): number {
    return this.records.size;
  }

  get limit(): number {
    return this.maxHandles;
  }

  issue(record: HandleRecord): string {
    if (this.records.size >= this.maxHandles)
      throw new HandleLimitError(this.maxHandles, this.records.size + 1);
    this.counter += 1;
    const handle = `h${this.counter}`;
    this.records.set(handle, { ...record, path: [...record.path] });
    return handle;
  }

  fork(reserve: number): HandleRegistry {
    const next = new HandleRegistry(this.maxHandles);
    next.counter = this.counter;
    this.counter += reserve;
    return next;
  }

  adopt(other: HandleRegistry): void {
    const records = new Map<string, HandleRecord>();
    for (const [handle, record] of other.records)
      records.set(handle, { ...record, path: [...record.path] });
    this.records = records;
    this.counter = Math.max(this.counter, other.counter);
  }

  get(handle: string): HandleRecord | null {
    const record = this.records.get(handle);
    return record ? { ...record, path: [...record.path] } : null;
  }

  invalidateFile(file: string): string[] {
    const removed: string[] = [];
    for (const [handle, record] of this.records) {
      if (record.file !== file) continue;
      this.records.delete(handle);
      removed.push(handle);
    }
    return removed;
  }

  invalidateAll(): string[] {
    const removed = [...this.records.keys()];
    this.records.clear();
    return removed;
  }
}
