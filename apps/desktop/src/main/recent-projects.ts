import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface RecentProjectRecord {
  root: string;
  name: string;
  lastOpenedAt: string;
  pageCount?: number;
}

export const MAX_RECENT_PROJECTS = 12;

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function normalizeRecentProjectRecord(
  value: unknown,
): RecentProjectRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const root = nonEmptyString(record.root);
  const lastOpenedAt = nonEmptyString(record.lastOpenedAt);
  if (!root || !lastOpenedAt) return null;
  if (Number.isNaN(Date.parse(lastOpenedAt))) return null;
  const name = nonEmptyString(record.name) ?? (basename(root) || "Untitled");
  const pageCount =
    typeof record.pageCount === "number" &&
    Number.isInteger(record.pageCount) &&
    record.pageCount >= 0
      ? record.pageCount
      : undefined;
  return {
    root,
    name,
    lastOpenedAt,
    ...(pageCount === undefined ? {} : { pageCount }),
  };
}

export function mergeRecentProject(
  records: RecentProjectRecord[],
  next: RecentProjectRecord,
  limit = MAX_RECENT_PROJECTS,
): RecentProjectRecord[] {
  const normalized = normalizeRecentProjectRecord(next);
  if (!normalized) return records.slice(0, Math.max(1, limit));
  const max = Math.max(1, limit);
  return [
    normalized,
    ...records.filter((record) => record.root !== normalized.root),
  ].slice(0, max);
}

export function removeRecentProject(
  records: RecentProjectRecord[],
  root: string,
): RecentProjectRecord[] {
  return records.filter((record) => record.root !== root);
}

export function recentProjectsFilePath(dataDir: string): string {
  return join(dataDir, "recent-projects.json");
}

export function readRecentProjectRecords(
  dataDir: string,
): RecentProjectRecord[] {
  try {
    const parsed = JSON.parse(
      readFileSync(recentProjectsFilePath(dataDir), "utf8"),
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeRecentProjectRecord)
      .filter((record): record is RecentProjectRecord => record !== null)
      .slice(0, MAX_RECENT_PROJECTS);
  } catch {
    return [];
  }
}

export function writeRecentProjectRecords(
  dataDir: string,
  records: RecentProjectRecord[],
): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    recentProjectsFilePath(dataDir),
    JSON.stringify(records.slice(0, MAX_RECENT_PROJECTS), null, 2),
    "utf8",
  );
}

export function recentProjectThumbnailPath(
  dataDir: string,
  root: string,
): string {
  const digest = createHash("sha1").update(root).digest("hex");
  return join(dataDir, "thumbnails", `${digest}.jpg`);
}
