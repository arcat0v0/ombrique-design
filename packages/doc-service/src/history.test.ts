import { describe, expect, it } from "vitest";
import { History } from "./history";

function record(
  history: History,
  actor: string,
  file: string,
  before: string,
  after: string,
) {
  return history.record({
    before: new Map([[file, before]]),
    after: new Map([[file, after]]),
    files: [file],
    actor,
  });
}

describe("History", () => {
  it("records and undoes entries in order", () => {
    const history = new History();
    record(history, "designer", "a", "1", "2");
    record(history, "designer", "a", "2", "3");
    expect(history.canUndo).toBe(true);
    expect(history.undo()?.before.get("a")).toBe("2");
    expect(history.undo()?.before.get("a")).toBe("1");
    expect(history.undo()).toBeNull();
    expect(history.canRedo).toBe(true);
    expect(history.redo()?.after.get("a")).toBe("2");
  });

  it("drops the redo stack after a new record but keeps the entry readable", () => {
    const history = new History();
    record(history, "designer", "a", "1", "2");
    const second = record(history, "designer", "b", "1", "2");
    history.undo();
    expect(history.canRedo).toBe(true);
    record(history, "designer", "c", "1", "2");
    expect(history.canRedo).toBe(false);
    expect(history.get(second.id)).not.toBeNull();
  });

  it("marks invalidated entries stale and keeps their snapshots", () => {
    const history = new History();
    const first = record(history, "designer", "a.tsx", "1", "2");
    record(history, "designer", "b.tsx", "1", "2");
    const affected = history.invalidate(["a.tsx"]);
    expect(affected).toEqual([first.id]);
    expect(history.size).toBe(2);
    expect(history.get(first.id)?.stale).toBe(true);
    expect(history.get(first.id)?.actor).toBe("designer");
    expect(history.get(first.id)?.createdAt).toBeGreaterThan(0);
    expect(history.get(first.id)?.files).toEqual(["a.tsx"]);
    expect(history.get(first.id)?.before.get("a.tsx")).toBe("1");
    expect(history.undo()?.files).toEqual(["b.tsx"]);
    expect(history.undo()).toBeNull();
    expect(history.redo()?.files).toEqual(["b.tsx"]);
  });

  it("coalesces no-op records from the same actor", () => {
    const history = new History();
    record(history, "designer", "a", "1", "2");
    record(history, "designer", "a", "2", "2");
    expect(history.size).toBe(1);
    expect(history.undo()?.after.get("a")).toBe("2");
    expect(history.undo()).toBeNull();
  });

  it("never coalesces adjacent records from different actors", () => {
    const history = new History();
    record(history, "designer", "a", "1", "2");
    record(history, "agent-1", "a", "2", "2");
    expect(history.size).toBe(2);
    expect(history.entries().map((entry) => entry.actor)).toEqual([
      "designer",
      "agent-1",
    ]);
  });

  it("skips agent entries while keeping redo order", () => {
    const history = new History();
    const first = record(history, "designer", "a", "1", "2");
    const agent = record(history, "agent-1", "b", "1", "2");
    const second = record(history, "designer", "c", "1", "2");
    expect(history.undo()?.id).toBe(second.id);
    expect(history.undo()?.id).toBe(first.id);
    expect(history.undo()).toBeNull();
    expect(history.get(agent.id)?.actor).toBe("agent-1");
    expect(history.redo()?.id).toBe(first.id);
    expect(history.redo()?.id).toBe(second.id);
    expect(history.redo()).toBeNull();
  });

  it("skips stale entries while keeping redo order", () => {
    const history = new History();
    const first = record(history, "designer", "a", "1", "2");
    const stale = record(history, "designer", "b", "1", "2");
    const second = record(history, "designer", "c", "1", "2");
    expect(history.invalidate(["b"])).toEqual([stale.id]);
    expect(history.undo()?.id).toBe(second.id);
    expect(history.undo()?.id).toBe(first.id);
    expect(history.undo()).toBeNull();
    expect(history.get(stale.id)?.stale).toBe(true);
    expect(history.redo()?.id).toBe(first.id);
    expect(history.redo()?.id).toBe(second.id);
    expect(history.redo()).toBeNull();
  });
});
