import {
  ChevronDownIcon,
  Code2Icon,
  ExpandIcon,
  Maximize2Icon,
  MonitorIcon,
  RotateCwIcon,
  ScanIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ViewMenuProps {
  zoom: number;
  busy?: boolean;
  alignOffset?: number;
  onZoomTo?: (factor: number) => void;
  onZoomToFit: () => void;
  onToggleFullscreen?: () => void;
  onToggleDevtools?: () => void;
  onReloadRenderer?: () => void;
}

export function ViewMenu({
  zoom,
  busy = false,
  alignOffset = 0,
  onZoomTo,
  onZoomToFit,
  onToggleFullscreen,
  onToggleDevtools,
  onReloadRenderer,
}: ViewMenuProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="视图与缩放"
              title="视图与缩放"
              disabled={busy}
              className="h-7 gap-1 px-1.5 text-xs font-mono font-normal tabular-nums"
            >
              <MonitorIcon className="size-3.5 text-muted-foreground" />
              <span>{Math.round(zoom * 100)}%</span>
              <ChevronDownIcon className="size-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">视图与缩放</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        alignOffset={alignOffset}
        className="w-44 p-1.5 shadow-lg"
      >
        <DropdownMenuLabel>视图</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={busy || !onZoomTo}
          onSelect={() => onZoomTo?.(zoom * 1.25)}
          className="px-2 py-1.5 text-xs"
        >
          <ZoomInIcon />
          <span>放大</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy || !onZoomTo}
          onSelect={() => onZoomTo?.(zoom / 1.25)}
          className="px-2 py-1.5 text-xs"
        >
          <ZoomOutIcon />
          <span>缩小</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy || !onZoomTo}
          onSelect={() => onZoomTo?.(1)}
          className="px-2 py-1.5 text-xs"
        >
          <ScanIcon />
          <span>100%</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={onZoomToFit}
          className="px-2 py-1.5 text-xs"
        >
          <Maximize2Icon />
          <span>适应画布</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!onToggleFullscreen}
          onSelect={onToggleFullscreen}
          className="px-2 py-1.5 text-xs"
        >
          <ExpandIcon />
          <span>全屏</span>
          <Kbd className="ml-auto">F11</Kbd>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onToggleDevtools}
          onSelect={onToggleDevtools}
          className="px-2 py-1.5 text-xs"
        >
          <Code2Icon />
          <span>开发者工具</span>
          <Kbd className="ml-auto">F12</Kbd>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onReloadRenderer}
          onSelect={onReloadRenderer}
          className="px-2 py-1.5 text-xs"
        >
          <RotateCwIcon />
          <span>重新加载</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
