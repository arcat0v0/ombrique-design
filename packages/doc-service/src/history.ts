export interface HistoryEntry {
  id: string;
  before: Map<string, string>;
  after: Map<string, string>;
  files: string[];
  createdAt: number;
  actor: string;
  stale: boolean;
}

export interface HistoryEntryView {
  readonly id: string;
  readonly before: ReadonlyMap<string, string>;
  readonly after: ReadonlyMap<string, string>;
  readonly files: readonly string[];
  readonly createdAt: number;
  readonly actor: string;
  readonly stale: boolean;
}

export type HistoryRecord = Omit<HistoryEntry, "id" | "createdAt" | "stale">;

export class History {
  private timeline: HistoryEntry[] = [];
  private discarded = new Set<string>();
  private cursor = 0;
  private counter = 0;

  record(entry: HistoryRecord): HistoryEntry {
    const last = this.lastActiveBeforeCursor();
    const overlaps =
      last !== undefined &&
      entry.files.some((file) => last.files.includes(file));
    const coalesced =
      last !== undefined &&
      !last.stale &&
      last.actor === entry.actor &&
      overlaps &&
      this.sameContent(last.after, entry.after);
    this.counter += 1;
    const full: HistoryEntry = {
      ...entry,
      id: `h${this.counter}`,
      createdAt: Date.now(),
      stale: false,
    };
    this.discardFrom(this.cursor);
    this.timeline.push(full);
    if (coalesced) this.discarded.add(full.id);
    this.cursor = this.timeline.length;
    return full;
  }

  private sameContent(a: Map<string, string>, b: Map<string, string>): boolean {
    if (a.size !== b.size) return false;
    for (const [file, text] of a) {
      if (b.get(file) !== text) return false;
    }
    return true;
  }

  private lastActiveBeforeCursor(): HistoryEntry | undefined {
    for (let index = this.cursor - 1; index >= 0; index -= 1) {
      const entry = this.timeline[index];
      if (entry && !this.discarded.has(entry.id)) return entry;
    }
    return undefined;
  }

  private discardFrom(index: number): void {
    for (let cursor = index; cursor < this.timeline.length; cursor += 1) {
      const entry = this.timeline[cursor];
      if (entry) this.discarded.add(entry.id);
    }
  }

  private eligible(entry: HistoryEntry): boolean {
    return (
      !entry.stale &&
      entry.actor === "designer" &&
      !this.discarded.has(entry.id)
    );
  }

  private lastEligibleBeforeCursor(): number {
    for (let index = this.cursor - 1; index >= 0; index -= 1) {
      const entry = this.timeline[index];
      if (entry && this.eligible(entry)) return index;
    }
    return -1;
  }

  private firstEligibleFromCursor(): number {
    for (let index = this.cursor; index < this.timeline.length; index += 1) {
      const entry = this.timeline[index];
      if (entry && this.eligible(entry)) return index;
    }
    return -1;
  }

  undo(): HistoryEntry | null {
    const index = this.lastEligibleBeforeCursor();
    const entry = index >= 0 ? this.timeline[index] : undefined;
    if (index < 0 || !entry) return null;
    this.cursor = index;
    return entry;
  }

  redo(): HistoryEntry | null {
    const index = this.firstEligibleFromCursor();
    const entry = index >= 0 ? this.timeline[index] : undefined;
    if (index < 0 || !entry) return null;
    this.cursor = index + 1;
    return entry;
  }

  invalidate(files: string[]): string[] {
    const touched = new Set(files);
    const affected: string[] = [];
    for (const entry of this.timeline) {
      if (!entry.stale && entry.files.some((file) => touched.has(file))) {
        entry.stale = true;
        affected.push(entry.id);
      }
    }
    return affected;
  }

  entries(): readonly HistoryEntryView[] {
    return this.timeline.map((entry) => this.view(entry));
  }

  get(id: string): HistoryEntryView | null {
    const entry = this.timeline.find((candidate) => candidate.id === id);
    return entry ? this.view(entry) : null;
  }

  private view(entry: HistoryEntry): HistoryEntryView {
    return {
      id: entry.id,
      before: new Map(entry.before),
      after: new Map(entry.after),
      files: [...entry.files],
      createdAt: entry.createdAt,
      actor: entry.actor,
      stale: entry.stale,
    };
  }

  clear(): void {
    this.timeline = [];
    this.discarded.clear();
    this.cursor = 0;
  }

  get canUndo(): boolean {
    return this.lastEligibleBeforeCursor() >= 0;
  }

  get canRedo(): boolean {
    return this.firstEligibleFromCursor() >= 0;
  }

  get size(): number {
    let count = 0;
    for (let index = 0; index < this.cursor; index += 1) {
      const entry = this.timeline[index];
      if (entry && !this.discarded.has(entry.id)) count += 1;
    }
    return count;
  }
}
