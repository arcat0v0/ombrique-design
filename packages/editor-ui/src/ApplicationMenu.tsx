import {
  BoxIcon,
  ChevronDownIcon,
  Code2Icon,
  DownloadIcon,
  ExpandIcon,
  FolderOpenIcon,
  FolderSearchIcon,
  Maximize2Icon,
  MinusIcon,
  Redo2Icon,
  RotateCwIcon,
  ScanIcon,
  SquareIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";

export interface ApplicationMenuProps {
  canUndo: boolean;
  canRedo: boolean;
  canDelete?: boolean;
  zoom: number;
  busy?: boolean;
  onOpenProject: () => void;
  onOpenExample?: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection?: () => void;
  onZoomTo?: (factor: number) => void;
  onZoomToFit: () => void;
  onToggleFullscreen?: () => void;
  onToggleDevtools?: () => void;
  onReloadRenderer?: () => void;
  onMinimizeWindow?: () => void;
  onToggleWindowMaximize?: () => void;
  onCloseWindow?: () => void;
}

export function ApplicationMenu({
  canUndo,
  canRedo,
  canDelete = false,
  zoom,
  busy = false,
  onOpenProject,
  onOpenExample,
  onExport,
  onUndo,
  onRedo,
  onDeleteSelection,
  onZoomTo,
  onZoomToFit,
  onToggleFullscreen,
  onToggleDevtools,
  onReloadRenderer,
  onMinimizeWindow,
  onToggleWindowMaximize,
  onCloseWindow,
}: ApplicationMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label="Ombrique 应用菜单"
          title="Ombrique 应用菜单"
          className="h-7 gap-1.5 px-2 text-xs font-semibold"
        >
          <span className="flex size-4 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <BoxIcon data-icon="inline-start" />
          </span>
          <span>Ombrique</span>
          <ChevronDownIcon data-icon="inline-end" className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel>文件</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={busy}
            onSelect={onOpenProject}
            className="px-2 py-1.5 text-xs"
          >
            <FolderOpenIcon />
            <span>打开项目</span>
          </DropdownMenuItem>
          {onOpenExample && (
            <DropdownMenuItem
              disabled={busy}
              onSelect={onOpenExample}
              className="px-2 py-1.5 text-xs"
            >
              <FolderSearchIcon />
              <span>打开示例项目</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={busy}
            onSelect={onExport}
            className="px-2 py-1.5 text-xs"
          >
            <DownloadIcon />
            <span>导出 PNG</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>编辑</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={busy || !canUndo}
            onSelect={onUndo}
            className="px-2 py-1.5 text-xs"
          >
            <Undo2Icon />
            <span>撤销</span>
            <Kbd className="ml-auto">Ctrl+Z</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy || !canRedo}
            onSelect={onRedo}
            className="px-2 py-1.5 text-xs"
          >
            <Redo2Icon />
            <span>重做</span>
            <Kbd className="ml-auto">Ctrl+Shift+Z</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy || !canDelete || !onDeleteSelection}
            onSelect={onDeleteSelection}
            className="px-2 py-1.5 text-xs"
          >
            <Trash2Icon />
            <span>删除所选</span>
            <Kbd className="ml-auto">Delete</Kbd>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
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
          <DropdownMenuItem
            disabled={!onToggleFullscreen}
            onSelect={onToggleFullscreen}
            title={onToggleFullscreen ? undefined : "当前桌面桥接不可用"}
            className="px-2 py-1.5 text-xs"
          >
            <ExpandIcon />
            <span>全屏</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onToggleDevtools}
            onSelect={onToggleDevtools}
            title={onToggleDevtools ? undefined : "当前桌面桥接不可用"}
            className="px-2 py-1.5 text-xs"
          >
            <Code2Icon />
            <span>开发者工具</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onReloadRenderer}
            onSelect={onReloadRenderer}
            title={onReloadRenderer ? undefined : "当前桌面桥接不可用"}
            className="px-2 py-1.5 text-xs"
          >
            <RotateCwIcon />
            <span>重新加载</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>窗口</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!onMinimizeWindow}
            onSelect={onMinimizeWindow}
            title={onMinimizeWindow ? undefined : "当前桌面桥接不可用"}
            className="px-2 py-1.5 text-xs"
          >
            <MinusIcon />
            <span>最小化</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onToggleWindowMaximize}
            onSelect={onToggleWindowMaximize}
            title={onToggleWindowMaximize ? undefined : "当前桌面桥接不可用"}
            className="px-2 py-1.5 text-xs"
          >
            <SquareIcon />
            <span>最大化/还原</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onCloseWindow}
            onSelect={onCloseWindow}
            title={onCloseWindow ? undefined : "当前桌面桥接不可用"}
            className="px-2 py-1.5 text-xs"
          >
            <XIcon />
            <span>关闭</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
