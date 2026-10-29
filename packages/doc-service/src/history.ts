export interface HistoryEntry {
  id: string;
  before: Map<string, string>;
  after: Map<string, string>;
  files: string[];
  createdAt: number;
}

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private counter = 0;

  record(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry {
    this.counter += 1;
    const full: HistoryEntry = {
      ...entry,
      id: `h${this.counter}`,
      createdAt: Date.now(),
    };
    this.past.push(full);
    this.future = [];
    return full;
  }

  undo(): HistoryEntry | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(entry);
    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push(entry);
    return entry;
  }

  invalidate(files: string[]): string[] {
    const touched = new Set(files);
    const dropped: string[] = [];
    this.past = this.past.filter((entry) => {
      if (entry.files.some((file) => touched.has(file))) {
        dropped.push(entry.id);
        return false;
      }
      return true;
    });
    this.future = this.future.filter(
      (entry) => !entry.files.some((file) => touched.has(file)),
    );
    return dropped;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }
}
