import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_PRESENCE_STATE,
  applyPresenceEvent,
  detectPresenceConflict,
  isPresenceEvent,
  presenceBoxVisual,
  presenceFlashOpacity,
  presenceTargetKey,
  prunePresenceFlashes,
  screenRectFromWorld,
  createPresencePaintScheduler,
} from "./presence";

const target = { file: "pages/home.tsx", path: [0, 0] };
const other = { file: "pages/home.tsx", path: [0, 1] };

function session(
  sessionId: string,
  actor: string,
  color: string,
  targets = [target],
) {
  return { sessionId, actor, color, targets };
}

describe("agent presence", () => {
  it("detects a conflict when two sessions point at the same target", () => {
    expect(
      detectPresenceConflict([
        session("s1", "agent-1", "#ff6b6b"),
        session("s2", "agent-2", "#4ecdc4"),
      ]),
    ).toEqual({
      target,
      actors: ["agent-1", "agent-2"],
    });
    expect(
      detectPresenceConflict([
        session("s1", "agent-1", "#ff6b6b"),
        session("s2", "agent-2", "#4ecdc4", [other]),
      ]),
    ).toBeNull();
  });

  it("keys targets by file and path", () => {
    expect(presenceTargetKey(target)).toBe("pages/home.tsx:0/0");
    expect(presenceTargetKey({ file: "pages/home.tsx", path: [] })).toBe(
      "pages/home.tsx:",
    );
  });

  it("projects world rects through the camera", () => {
    expect(
      screenRectFromWorld(
        { x: 100, y: 50, width: 20, height: 10 },
        { x: 90, y: 40, z: 2 },
      ),
    ).toEqual({ left: 20, top: 20, width: 40, height: 20 });
  });

  it("applies snapshots and flashes while keeping flash state separate", () => {
    const snapshot = applyPresenceEvent(
      EMPTY_PRESENCE_STATE,
      {
        kind: "snapshot",
        sessions: [
          session("s1", "agent-1", "#ff6b6b"),
          session("s2", "agent-2", "#4ecdc4"),
        ],
        conflict: null,
      },
      1000,
    );
    const flashed = applyPresenceEvent(
      snapshot,
      {
        kind: "flash",
        flash: {
          id: "f1",
          actor: "agent-1",
          color: "#ff6b6b",
          targets: [target],
          startedAt: 1000,
          durationMs: 2000,
        },
      },
      1000,
    );
    expect(flashed.sessions).toHaveLength(2);
    expect(flashed.flashes).toHaveLength(1);
    const flash = flashed.flashes[0];
    if (!flash) throw new Error("missing flash");
    expect(presenceFlashOpacity(flash, 1000)).toBe(1);
    expect(presenceFlashOpacity(flash, 2000)).toBe(0.5);
    expect(presenceFlashOpacity(flash, 3000)).toBe(0);
    expect(applyPresenceEvent(flashed, { kind: "clear" }, 3000)).toEqual(
      EMPTY_PRESENCE_STATE,
    );
  });

  it("drops expired flashes and accepts only known presence events", () => {
    const state = {
      sessions: [],
      conflict: null,
      flashes: [
        {
          id: "old",
          actor: "agent-1",
          color: "#ff6b6b",
          targets: [target],
          startedAt: 0,
          durationMs: 2000,
        },
      ],
    };
    const next = applyPresenceEvent(
      state,
      { kind: "snapshot", sessions: [], conflict: null },
      2500,
    );
    expect(next.flashes).toHaveLength(0);
    expect(
      isPresenceEvent({ kind: "snapshot", sessions: [], conflict: null }),
    ).toBe(true);
    expect(isPresenceEvent({ kind: "flash" })).toBe(false);
    expect(isPresenceEvent({ kind: "nope" })).toBe(false);
  });
});

describe("presence flash scheduling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function flashState(now: number) {
    return applyPresenceEvent(
      EMPTY_PRESENCE_STATE,
      {
        kind: "flash",
        flash: {
          id: "f1",
          actor: "agent-1",
          color: "#ff6b6b",
          targets: [target],
          startedAt: now,
          durationMs: 2000,
        },
      },
      now,
    );
  }

  it("paints the flash immediately and fades it with timers when rAF never fires", async () => {
    vi.useFakeTimers({ now: 0 });
    let state = flashState(0);
    const opacities: number[] = [];
    const scheduler = createPresencePaintScheduler({
      paint: () => {
        const flash = state.flashes[0];
        opacities.push(flash ? presenceFlashOpacity(flash, Date.now()) : 0);
        state = {
          ...state,
          flashes: prunePresenceFlashes(state.flashes, Date.now()),
        };
      },
      activeFlashes: () =>
        state.flashes.some(
          (flash) => presenceFlashOpacity(flash, Date.now()) > 0,
        ),
    });

    scheduler.paintNow();
    expect(opacities).toEqual([1]);
    expect(scheduler.ticking()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(opacities.length).toBeGreaterThan(10);
    expect(opacities.at(-1)).toBeCloseTo(0.5, 5);
    expect(state.flashes).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1100);
    expect(opacities.at(-1)).toBe(0);
    expect(state.flashes).toHaveLength(0);
    expect(scheduler.ticking()).toBe(false);

    const painted = opacities.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(opacities).toHaveLength(painted);
  });

  it("keeps a bounded timer sequence per flash burst", async () => {
    vi.useFakeTimers({ now: 0 });
    let state = flashState(0);
    const paints: number[] = [];
    const scheduler = createPresencePaintScheduler({
      paint: () => {
        paints.push(Date.now());
        state = {
          ...state,
          flashes: prunePresenceFlashes(state.flashes, Date.now()),
        };
      },
      activeFlashes: () =>
        state.flashes.some(
          (flash) => presenceFlashOpacity(flash, Date.now()) > 0,
        ),
    });

    scheduler.paintNow();
    await vi.advanceTimersByTimeAsync(2500);
    expect(paints.length).toBeGreaterThan(30);
    expect(paints.length).toBeLessThanOrEqual(45);
  });

  it("distinguishes a flash from a persistent focus with the same color and rect", () => {
    const focus = presenceBoxVisual("#ff6b6b", "focus");
    const flash = presenceBoxVisual("#ff6b6b", "flash");
    const conflict = presenceBoxVisual("#ff6b6b", "conflict");
    expect(flash.border).not.toBe(focus.border);
    expect(flash.background).not.toBe(focus.background);
    expect(flash.boxShadow).not.toBe(focus.boxShadow);
    expect(flash.border).not.toBe(conflict.border);
    expect(flash.background).not.toBe(conflict.background);
    expect(focus.background).toBe("transparent");
  });
});
