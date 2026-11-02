import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_RECENT_PROJECTS,
  mergeRecentProject,
  normalizeRecentProjectRecord,
  readRecentProjectRecords,
  recentProjectThumbnailPath,
  removeRecentProject,
  writeRecentProjectRecords,
} from "./recent-projects";

function record(root: string, lastOpenedAt = "2026-01-01T00:00:00.000Z") {
  return {
    root,
    name: root.split("/").filter(Boolean).pop() ?? "project",
    lastOpenedAt,
  };
}

describe("recent projects", () => {
  it("keeps the latest project first and de-duplicates by root", () => {
    const first = record("/work/alpha", "2026-01-01T00:00:00.000Z");
    const second = record("/work/beta", "2026-01-02T00:00:00.000Z");
    const merged = mergeRecentProject(
      [first],
      record("/work/alpha", "2026-01-03T00:00:00.000Z"),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.lastOpenedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(mergeRecentProject(merged, second)[0]).toEqual(second);
  });

  it("caps the history at the configured limit", () => {
    let records: ReturnType<typeof record>[] = [];
    for (let index = 0; index < MAX_RECENT_PROJECTS + 4; index += 1) {
      records = mergeRecentProject(
        records,
        record(`/work/${index}`, new Date(2026, 0, index + 1).toISOString()),
      );
    }
    expect(records).toHaveLength(MAX_RECENT_PROJECTS);
    expect(records[0]?.root).toBe("/work/15");
  });

  it("rejects malformed records and fills in a fallback name", () => {
    expect(normalizeRecentProjectRecord(null)).toBeNull();
    expect(
      normalizeRecentProjectRecord({ root: "", lastOpenedAt: "" }),
    ).toBeNull();
    expect(
      normalizeRecentProjectRecord({
        root: "/work/gamma",
        lastOpenedAt: "not-a-date",
      }),
    ).toBeNull();
    expect(
      normalizeRecentProjectRecord({
        root: "/work/gamma",
        name: "   ",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
        pageCount: 2,
      }),
    ).toEqual({
      root: "/work/gamma",
      name: "gamma",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      pageCount: 2,
    });
  });

  it("persists a sanitized list and tolerates missing or corrupt files", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ombrique-recents-"));
    expect(readRecentProjectRecords(dataDir)).toEqual([]);

    writeRecentProjectRecords(dataDir, [
      record("/work/alpha"),
      { root: "", name: "bad", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
    ] as never);
    expect(readRecentProjectRecords(dataDir)).toEqual([record("/work/alpha")]);
    expect(
      JSON.parse(readFileSync(join(dataDir, "recent-projects.json"), "utf8")),
    ).toHaveLength(2);

    writeFileSync(join(dataDir, "recent-projects.json"), "{broken", "utf8");
    expect(readRecentProjectRecords(dataDir)).toEqual([]);
  });

  it("removes an entry without disturbing the rest", () => {
    const records = [record("/work/a"), record("/work/b")];
    expect(removeRecentProject(records, "/work/a")).toEqual([records[1]]);
    expect(removeRecentProject(records, "/work/missing")).toEqual(records);
  });

  it("derives a stable thumbnail path per project", () => {
    const dataDir = "/tmp/user-data";
    const a = recentProjectThumbnailPath(dataDir, "/work/a");
    expect(a).toBe(recentProjectThumbnailPath(dataDir, "/work/a"));
    expect(a).not.toBe(recentProjectThumbnailPath(dataDir, "/work/b"));
    expect(a.endsWith(".jpg")).toBe(true);
    expect(a).toContain(join("thumbnails", ""));
  });
});
