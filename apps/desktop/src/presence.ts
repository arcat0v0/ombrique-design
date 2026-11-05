export interface PresenceTarget {
  file: string;
  path: number[];
}

export interface PresenceSession {
  sessionId: string;
  actor: string;
  color: string;
  targets: PresenceTarget[];
}

export interface PresenceConflict {
  target: PresenceTarget;
  actors: string[];
}

export interface PresenceFlash {
  id: string;
  actor: string;
  color: string;
  targets: PresenceTarget[];
  startedAt: number;
  durationMs: number;
}

export interface PresenceState {
  sessions: PresenceSession[];
  conflict: PresenceConflict | null;
  flashes: PresenceFlash[];
}

export type PresenceEvent =
  | {
      kind: "snapshot";
      sessions: PresenceSession[];
      conflict: PresenceConflict | null;
      clearFlashes?: boolean;
    }
  | { kind: "flash"; flash: PresenceFlash }
  | { kind: "clear" };

export const EMPTY_PRESENCE_STATE: PresenceState = {
  sessions: [],
  conflict: null,
  flashes: [],
};

export function presenceTargetKey(target: PresenceTarget): string {
  return `${target.file}:${target.path.join("/")}`;
}

export function detectPresenceConflict(
  sessions: PresenceSession[],
): PresenceConflict | null {
  const byTarget = new Map<
    string,
    { target: PresenceTarget; actors: string[] }
  >();
  for (const session of sessions) {
    for (const target of session.targets) {
      const key = presenceTargetKey(target);
      const entry = byTarget.get(key) ?? {
        target,
        actors: [],
      };
      if (!entry.actors.includes(session.actor))
        entry.actors.push(session.actor);
      byTarget.set(key, entry);
    }
  }
  const conflicts = [...byTarget.entries()]
    .filter(([, entry]) => entry.actors.length > 1)
    .sort(([left], [right]) => left.localeCompare(right));
  const first = conflicts[0]?.[1];
  return first
    ? { target: first.target, actors: [...first.actors].sort() }
    : null;
}

export function presenceFlashOpacity(
  flash: PresenceFlash,
  now: number,
): number {
  if (flash.durationMs <= 0) return 0;
  const elapsed = now - flash.startedAt;
  if (elapsed <= 0) return 1;
  return Math.max(0, 1 - elapsed / flash.durationMs);
}

export function applyPresenceEvent(
  state: PresenceState,
  event: PresenceEvent,
  now: number,
): PresenceState {
  if (event.kind === "clear") return EMPTY_PRESENCE_STATE;
  if (event.kind === "flash")
    return {
      ...state,
      flashes: prunePresenceFlashes([...state.flashes, event.flash], now),
    };
  return {
    ...state,
    sessions: event.sessions,
    conflict: event.conflict,
    flashes: event.clearFlashes ? [] : prunePresenceFlashes(state.flashes, now),
  };
}

export function prunePresenceFlashes(
  flashes: PresenceFlash[],
  now: number,
): PresenceFlash[] {
  return flashes.filter((flash) => presenceFlashOpacity(flash, now) > 0);
}

export interface PresenceScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function screenRectFromWorld(
  rect: { x: number; y: number; width: number; height: number },
  camera: { x: number; y: number; z: number },
): PresenceScreenRect {
  return {
    left: (rect.x - camera.x) * camera.z,
    top: (rect.y - camera.y) * camera.z,
    width: rect.width * camera.z,
    height: rect.height * camera.z,
  };
}

export function isPresenceEvent(value: unknown): value is PresenceEvent {
  if (typeof value !== "object" || value === null || !("kind" in value))
    return false;
  const kind = value.kind;
  if (kind === "clear") return true;
  if (kind === "snapshot") {
    if (!("sessions" in value) || !("conflict" in value)) return false;
    const sessions = value.sessions;
    const conflict = value.conflict;
    if (!Array.isArray(sessions) || !sessions.every(isPresenceSession))
      return false;
    if (conflict === null) return true;
    if (
      typeof conflict !== "object" ||
      conflict === null ||
      !("target" in conflict) ||
      !("actors" in conflict)
    )
      return false;
    return (
      isPresenceTarget(conflict.target) &&
      Array.isArray(conflict.actors) &&
      conflict.actors.every((actor) => typeof actor === "string")
    );
  }
  if (kind === "flash") {
    if (!("flash" in value)) return false;
    return isPresenceFlash(value.flash);
  }
  return false;
}

function isPresenceSession(value: unknown): value is PresenceSession {
  if (
    typeof value !== "object" ||
    value === null ||
    !("sessionId" in value) ||
    !("actor" in value) ||
    !("color" in value) ||
    !("targets" in value)
  )
    return false;
  return (
    typeof value.sessionId === "string" &&
    typeof value.actor === "string" &&
    typeof value.color === "string" &&
    Array.isArray(value.targets) &&
    value.targets.every(isPresenceTarget)
  );
}

function isPresenceTarget(value: unknown): value is PresenceTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    !("file" in value) ||
    !("path" in value)
  )
    return false;
  return (
    typeof value.file === "string" &&
    Array.isArray(value.path) &&
    value.path.every((part) => typeof part === "number")
  );
}

function isPresenceFlash(value: unknown): value is PresenceFlash {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    !("actor" in value) ||
    !("color" in value) ||
    !("targets" in value) ||
    !("startedAt" in value) ||
    !("durationMs" in value)
  )
    return false;
  return (
    typeof value.id === "string" &&
    typeof value.actor === "string" &&
    typeof value.color === "string" &&
    Array.isArray(value.targets) &&
    value.targets.every(isPresenceTarget) &&
    typeof value.startedAt === "number" &&
    typeof value.durationMs === "number"
  );
}

export const PRESENCE_FLASH_TICK_MS = 50;

export type PresenceBoxVariant = "focus" | "flash" | "conflict";

export interface PresenceBoxVisual {
  border: string;
  boxShadow: string;
  background: string;
}

export function presenceBoxVisual(
  color: string,
  variant: PresenceBoxVariant,
): PresenceBoxVisual {
  if (variant === "conflict")
    return {
      border: `3px dashed ${color}`,
      boxShadow: `0 0 0 2px #ffffff, 0 0 0 4px ${color}`,
      background: "transparent",
    };
  if (variant === "flash")
    return {
      border: `3px solid ${color}`,
      boxShadow: `0 0 0 1px #ffffff, 0 0 14px 2px ${color}, inset 0 0 0 3px ${color}`,
      background: `color-mix(in srgb, ${color} 22%, transparent)`,
    };
  return {
    border: `2px solid ${color}`,
    boxShadow: "0 0 0 1px rgb(0 0 0 / 35%)",
    background: "transparent",
  };
}

export interface PresencePaintSchedulerOptions {
  paint: () => void;
  activeFlashes: () => boolean;
  tickMs?: number;
  setTimer?: (handler: () => void, delay: number) => number;
  clearTimer?: (handle: number) => void;
}

export interface PresencePaintScheduler {
  paintNow: () => void;
  ticking: () => boolean;
  stop: () => void;
}

export function createPresencePaintScheduler(
  options: PresencePaintSchedulerOptions,
): PresencePaintScheduler {
  const tickMs = options.tickMs ?? PRESENCE_FLASH_TICK_MS;
  const setTimer =
    options.setTimer ??
    ((handler: () => void, delay: number) =>
      setTimeout(handler, delay) as unknown as number);
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  let timer: number | null = null;

  function stop() {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  }

  function schedule() {
    if (timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      options.paint();
      if (options.activeFlashes()) schedule();
    }, tickMs);
  }

  return {
    paintNow() {
      options.paint();
      if (options.activeFlashes()) schedule();
      else stop();
    },
    ticking: () => timer !== null,
    stop,
  };
}
