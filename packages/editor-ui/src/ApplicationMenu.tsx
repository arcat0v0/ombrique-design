import type { RecentProject } from "@ombrique/protocol";
import {
  BoxIcon,
  ChevronDownIcon,
  DownloadIcon,
  FilePlus2Icon,
  FolderIcon,
  FolderOpenIcon,
  FolderSearchIcon,
  LayoutGridIcon,
  PackageOpenIcon,
  Redo2Icon,
  Trash2Icon,
  Undo2Icon,
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
  busy?: boolean;
  onOpenProject: () => void;
  onCreateProject?: () => void;
  onOpenBundle?: () => void;
  onOpenExample?: () => void;
  onOpenRecentProject?: (root: string) => void;
  onShowWorkspace?: () => void;
  recentProjects?: RecentProject[];
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection?: () => void;
}

export function ApplicationMenu({
  canUndo,
  canRedo,
  canDelete = false,
  busy = false,
  onOpenProject,
  onCreateProject,
  onOpenBundle,
  onOpenExample,
  onOpenRecentProject,
  onShowWorkspace,
  recentProjects,
  onExport,
  onUndo,
  onRedo,
  onDeleteSelection,
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
      <DropdownMenuContent align="start" className="w-56 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel>文件</DropdownMenuLabel>
          {onCreateProject && (
            <DropdownMenuItem
              disabled={busy}
              onSelect={onCreateProject}
              className="px-2 py-1.5 text-xs"
            >
              <FilePlus2Icon />
              <span>新建项目</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={busy}
            onSelect={onOpenProject}
            className="px-2 py-1.5 text-xs"
          >
            <FolderOpenIcon />
            <span>打开本地项目</span>
          </DropdownMenuItem>
          {onOpenBundle && (
            <DropdownMenuItem
              disabled={busy}
              onSelect={onOpenBundle}
              className="px-2 py-1.5 text-xs"
            >
              <PackageOpenIcon />
              <span>打开 .ombrique 项目包</span>
            </DropdownMenuItem>
          )}
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
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>最近打开</DropdownMenuLabel>
          {recentProjects && recentProjects.length > 0 ? (
            recentProjects.slice(0, 5).map((project) => (
              <DropdownMenuItem
                key={project.root}
                disabled={busy || !onOpenRecentProject || !project.exists}
                onSelect={() => onOpenRecentProject?.(project.root)}
                className="px-2 py-1.5 text-xs"
              >
                <FolderIcon />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{project.name}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {project.exists ? project.root : "路径不存在"}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled className="px-2 py-1.5 text-xs">
              <FolderIcon />
              <span>暂无最近项目</span>
            </DropdownMenuItem>
          )}
          {recentProjects && recentProjects.length > 0 && onShowWorkspace && (
            <DropdownMenuItem
              disabled={busy}
              onSelect={onShowWorkspace}
              className="px-2 py-1.5 text-xs"
            >
              <LayoutGridIcon />
              <span>查看全部项目</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {onShowWorkspace && (
            <DropdownMenuItem
              disabled={busy}
              onSelect={onShowWorkspace}
              className="px-2 py-1.5 text-xs"
            >
              <LayoutGridIcon />
              <span>返回工作区</span>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
