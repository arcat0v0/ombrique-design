import { AGENT_PALETTE, type HistorySnapshotEntry } from "@ombrique/protocol";

export interface ActorBadge {
  label: string;
  color: string;
}

export function formatActorBadge(actor: string): ActorBadge {
  if (actor === "designer") return { label: "设计师", color: "#4c8dff" };
  const match = /^agent-(\d+)$/.exec(actor);
  if (!match?.[1]) return { label: actor, color: "#9aa0aa" };
  const index = (Number(match[1]) - 1) % AGENT_PALETTE.length;
  return { label: actor, color: AGENT_PALETTE[index] ?? "#9aa0aa" };
}

export function buildRollbackFiles(
  currentFiles: Readonly<Record<string, string>>,
  before: Readonly<Record<string, string>>,
): Record<string, string> {
  const target: Record<string, string> = { ...currentFiles };
  for (const [file, text] of Object.entries(before)) {
    if (text === "") delete target[file];
    else target[file] = text;
  }
  return target;
}

export function formatEditHistoryTime(createdAt: number, now: number): string {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return `${Math.floor(elapsed / 86_400_000)} 天前`;
}

export interface EditHistorySummary {
  actorLabel: string;
  actorColor: string;
  timeLabel: string;
  filesLabel: string;
  stale: boolean;
  rollbackable: boolean;
}

export function summarizeEditHistoryEntry(
  entry: HistorySnapshotEntry,
  now: number,
): EditHistorySummary {
  const badge = formatActorBadge(entry.actor);
  return {
    actorLabel: badge.label,
    actorColor: badge.color,
    timeLabel: formatEditHistoryTime(entry.createdAt, now),
    filesLabel: entry.files.join(", "),
    stale: entry.stale,
    rollbackable: true,
  };
}
