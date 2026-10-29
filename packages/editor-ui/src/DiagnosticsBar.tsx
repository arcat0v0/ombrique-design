import type { DiagnosticItem } from "@ombrique/protocol";
import { AlertCircleIcon, InfoIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface DiagnosticsBarProps {
  diagnostics: DiagnosticItem[];
  notice: string | null;
  onDismissNotice: () => void;
}

export function DiagnosticsBar({
  diagnostics,
  notice,
  onDismissNotice,
}: DiagnosticsBarProps) {
  const latest =
    diagnostics.length > 0 ? diagnostics[diagnostics.length - 1] : undefined;

  return (
    <footer className="diagnostics-bar flex h-7 items-center justify-between border-t border-border bg-card/90 px-3 text-xs select-none">
      <div className="flex items-center gap-2 overflow-hidden">
        <Badge
          variant="outline"
          className="diagnostics-count h-5 px-1.5 text-[10px] font-mono font-medium text-muted-foreground"
        >
          {diagnostics.length} 条诊断
        </Badge>

        {latest !== undefined && (
          <span
            className={`diagnostics-latest diagnostics-latest-${latest.severity} flex items-center gap-1 truncate text-[11px] ${
              latest.severity === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">
              {latest.file}: {latest.message}
            </span>
          </span>
        )}
      </div>

      {notice !== null && (
        <div
          className="notice-bar flex items-center gap-1.5 rounded bg-muted/80 px-2 py-0.5 text-xs text-foreground"
          role="status"
        >
          <InfoIcon className="size-3 shrink-0 text-primary" />
          <span className="notice-text truncate">{notice}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="notice-dismiss size-4 text-muted-foreground hover:text-foreground"
            aria-label="关闭通知"
            title="关闭通知"
            onClick={onDismissNotice}
          >
            <XIcon className="size-2.5" />
          </Button>
        </div>
      )}
    </footer>
  );
}

function AlertCircle(props: { className?: string }) {
  return <AlertCircleIcon {...props} />;
}
