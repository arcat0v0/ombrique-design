import { describe, expect, it } from "vitest";
import { History } from "./history";

describe("History", () => {
  it("records and undoes entries in order", () => {
    const history = new History();
    history.record({
      before: new Map([["a", "1"]]),
      after: new Map([["a", "2"]]),
      files: ["a"],
    });
    history.record({
      before: new Map([["a", "2"]]),
      after: new Map([["a", "3"]]),
      files: ["a"],
    });
    expect(history.canUndo).toBe(true);
    expect(history.undo()?.before.get("a")).toBe("2");
    expect(history.undo()?.before.get("a")).toBe("1");
    expect(history.undo()).toBeNull();
    expect(history.canRedo).toBe(true);
    expect(history.redo()?.after.get("a")).toBe("2");
  });

  it("drops the redo stack after a new record", () => {
    const history = new History();
    history.record({ before: new Map(), after: new Map(), files: ["a"] });
    history.undo();
    expect(history.canRedo).toBe(true);
    history.record({ before: new Map(), after: new Map(), files: ["b"] });
    expect(history.canRedo).toBe(false);
  });

  it("invalidates entries touching external files", () => {
    const history = new History();
    history.record({ before: new Map(), after: new Map(), files: ["a.tsx"] });
    history.record({ before: new Map(), after: new Map(), files: ["b.tsx"] });
    const dropped = history.invalidate(["a.tsx"]);
    expect(dropped).toHaveLength(1);
    expect(history.size).toBe(1);
    expect(history.undo()?.files).toEqual(["b.tsx"]);
  });

  it("coalesces no-op records that do not change content", () => {
    const history = new History();
    history.record({
      before: new Map([["a", "1"]]),
      after: new Map([["a", "2"]]),
      files: ["a"],
    });
    history.record({
      before: new Map([["a", "2"]]),
      after: new Map([["a", "2"]]),
      files: ["a"],
    });
    expect(history.size).toBe(1);
    expect(history.undo()?.after.get("a")).toBe("2");
    expect(history.undo()).toBeNull();
  });

  it("coalesces repeated identical records into one undo step", () => {
    const history = new History();
    history.record({
      before: new Map([["a", "1"]]),
      after: new Map([["a", "2"]]),
      files: ["a"],
    });
    history.record({
      before: new Map([["a", "2"]]),
      after: new Map([["a", "2"]]),
      files: ["a"],
    });
    history.record({
      before: new Map([["a", "2"]]),
      after: new Map([["a", "2"]]),
      files: ["a"],
    });
    expect(history.size).toBe(1);
  });
});
