import { useState } from "react";
import type { HistorySnapshotEntry } from "@ombrique/protocol";
import { HistoryIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { summarizeEditHistoryEntry } from "./transaction-history";

export interface TransactionHistoryPanelProps {
  entries?: HistorySnapshotEntry[];
  onRefresh?: () => Promise<void>;
  onRestore?: (id: string) => Promise<boolean>;
}

export function TransactionHistoryPanel({
  entries = [],
  onRefresh,
  onRestore,
}: TransactionHistoryPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = Date.now();

  const handleRestore = async (id: string) => {
    if (!onRestore) return;
    setBusyId(id);
    try {
      await onRestore(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <HistoryIcon className="size-3.5" />
          编辑历史
          <Badge variant="secondary" className="h-5 text-[10px]">
            {entries.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="size-7 p-0"
          onClick={() => void onRefresh?.()}
          aria-label="刷新编辑历史"
        >
          <RefreshCwIcon className="size-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5">
          {entries.map((entry) => {
            const summary = summarizeEditHistoryEntry(entry, now);
            return (
              <div
                key={entry.id}
                className="rounded-md border border-border/50 bg-card/40 p-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: summary.actorColor }}
                    />
                    <span className="truncate font-medium">
                      {summary.actorLabel}
                    </span>
                    {summary.stale && (
                      <Badge
                        variant="outline"
                        className="h-5 border-amber-500/50 text-[10px] text-amber-500"
                      >
                        外部修改
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 text-muted-foreground">
                    {summary.timeLabel}
                  </span>
                </div>
                <div
                  className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                  title={summary.filesLabel}
                >
                  {summary.filesLabel}
                </div>
                <div className="mt-1.5 flex justify-end">
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 gap-1 text-[10px]"
                    disabled={busyId === entry.id}
                    onClick={() => void handleRestore(entry.id)}
                  >
                    <RotateCcwIcon className="size-3" />
                    回滚到此前
                  </Button>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              暂无编辑事务历史
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
