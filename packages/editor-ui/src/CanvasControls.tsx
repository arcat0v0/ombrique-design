import {
  Maximize2Icon,
  MinusIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface CanvasControlsProps {
  zoom: number;
  hasSelection: boolean;
  inspectorVisible: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomToFit: () => void;
  onToggleInspector: () => void;
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="canvas-control-button flex h-8 w-8 items-center justify-center text-[#b4b4b4] transition-colors hover:bg-[#242424] hover:text-white focus-visible:bg-[#242424] focus-visible:text-white focus-visible:outline-none"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function CanvasControls({
  zoom,
  hasSelection,
  inspectorVisible,
  onZoomOut,
  onZoomIn,
  onZoomToFit,
  onToggleInspector,
}: CanvasControlsProps) {
  return (
    <div className="editor-canvas-controls pointer-events-auto flex h-8 items-stretch overflow-hidden rounded-full border border-[#303030] bg-[#171717] text-xs tabular-nums">
      <ControlButton label="缩小" onClick={onZoomOut}>
        <MinusIcon className="size-3.5" />
      </ControlButton>
      <button
        type="button"
        aria-label="当前缩放"
        onClick={onZoomToFit}
        className="flex min-w-12 items-center justify-center border-r border-l border-[#2a2a2a] px-1 text-[#b4b4b4] transition-colors hover:bg-[#242424] hover:text-white focus-visible:bg-[#242424] focus-visible:text-white focus-visible:outline-none"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ControlButton label="放大" onClick={onZoomIn}>
        <PlusIcon className="size-3.5" />
      </ControlButton>
      <div className="my-1 w-px bg-[#2a2a2a]" />
      <ControlButton label="适应画布" onClick={onZoomToFit}>
        <Maximize2Icon className="size-3.5" />
      </ControlButton>
      {hasSelection && (
        <ControlButton
          label={inspectorVisible ? "隐藏属性面板" : "显示属性面板"}
          onClick={onToggleInspector}
        >
          <SlidersHorizontalIcon className="size-3.5" />
        </ControlButton>
      )}
    </div>
  );
}
