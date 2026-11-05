import { describe, expect, it } from "vitest";
import { AGENT_PALETTE, type HistorySnapshotEntry } from "@ombrique/protocol";
import {
  buildRollbackFiles,
  formatActorBadge,
  formatEditHistoryTime,
  summarizeEditHistoryEntry,
} from "./transaction-history";

function entry(
  actor: string,
  before: Record<string, string>,
  options: Partial<HistorySnapshotEntry> = {},
): HistorySnapshotEntry {
  return {
    id: options.id ?? "h1",
    actor,
    stale: options.stale ?? false,
    createdAt: options.createdAt ?? 1000,
    files: options.files ?? Object.keys(before),
    before,
    after: options.after ?? before,
  };
}

describe("transaction history", () => {
  it("maps actors to badges and palette colors", () => {
    expect(formatActorBadge("designer")).toEqual({
      label: "设计师",
      color: "#4c8dff",
    });
    expect(formatActorBadge("agent-2")).toEqual({
      label: "agent-2",
      color: AGENT_PALETTE[1],
    });
    expect(formatActorBadge("custom")).toEqual({
      label: "custom",
      color: "#9aa0aa",
    });
  });

  it("builds restoreVersion input from current files and before snapshots", () => {
    const target = buildRollbackFiles(
      {
        "pages/home.tsx": "current home",
        "pages/pricing.tsx": "current pricing",
        "components/Card.tsx": "current card",
      },
      {
        "pages/home.tsx": "old home",
        "pages/pricing.tsx": "",
        "components/Card.tsx": "old card",
      },
    );
    expect(target).toEqual({
      "pages/home.tsx": "old home",
      "components/Card.tsx": "old card",
    });
  });

  it("still builds rollback input for stale entries", () => {
    const stale = entry(
      "designer",
      { "pages/home.tsx": "before", "pages/pricing.tsx": "" },
      { stale: true },
    );
    expect(
      buildRollbackFiles(
        {
          "pages/home.tsx": "current",
          "pages/pricing.tsx": "current",
        },
        stale.before,
      ),
    ).toEqual({ "pages/home.tsx": "before" });
    expect(summarizeEditHistoryEntry(stale, 2000)).toMatchObject({
      stale: true,
      rollbackable: true,
    });
  });

  it("formats relative time and file summaries", () => {
    expect(formatEditHistoryTime(1000, 1000)).toBe("刚刚");
    expect(formatEditHistoryTime(1000, 1000 + 90_000)).toBe("1 分钟前");
    expect(formatEditHistoryTime(1000, 1000 + 3 * 3_600_000)).toBe("3 小时前");
    const summary = summarizeEditHistoryEntry(
      entry("agent-2", {
        "pages/home.tsx": "a",
        "components/Card.tsx": "b",
      }),
      2000,
    );
    expect(summary.filesLabel).toBe("pages/home.tsx, components/Card.tsx");
    expect(summary.actorLabel).toBe("agent-2");
  });
});
