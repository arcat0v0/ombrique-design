import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react";

export interface WindowControlsProps {
  maximized?: boolean;
  onMinimize?: () => void;
  onToggleMaximize?: () => void;
  onClose?: () => void;
}

const buttonClass =
  "flex w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

export function WindowControls({
  maximized = false,
  onMinimize,
  onToggleMaximize,
  onClose,
}: WindowControlsProps) {
  return (
    <div
      className="window-controls flex self-stretch [-webkit-app-region:no-drag]"
      data-titlebar-controls=""
    >
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        className={buttonClass}
        onClick={onMinimize}
        disabled={!onMinimize}
      >
        <MinusIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={maximized ? "还原窗口" : "最大化"}
        title={maximized ? "还原窗口" : "最大化"}
        className={buttonClass}
        onClick={onToggleMaximize}
        disabled={!onToggleMaximize}
      >
        {maximized ? (
          <CopyIcon className="size-3.5" />
        ) : (
          <SquareIcon className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        aria-label="关闭"
        title="关闭"
        className={`${buttonClass} hover:bg-destructive hover:text-white`}
        onClick={onClose}
        disabled={!onClose}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}