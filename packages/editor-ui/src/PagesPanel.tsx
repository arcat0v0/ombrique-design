import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PageTab } from "./types";

export interface PagesPanelProps {
  pages: PageTab[];
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRenamePage?: (pageId: string, name: string) => void;
  onDeletePage?: (pageId: string) => void;
}

export function PagesPanel({
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
}: PagesPanelProps) {
  const [renamingPage, setRenamingPage] = useState<PageTab | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingPage, setDeletingPage] = useState<PageTab | null>(null);
  const [dropdownPageId, setDropdownPageId] = useState<string | null>(null);
  const startRename = (page: PageTab) => {
    setRenamingPage(page);
    setRenameValue(page.name);
  };

  const commitRename = () => {
    if (!renamingPage) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renamingPage.name) {
      onRenamePage?.(renamingPage.id, trimmed);
    }
    setRenamingPage(null);
  };

  const confirmDelete = () => {
    if (!deletingPage) return;
    onDeletePage?.(deletingPage.id);
    setDeletingPage(null);
  };

  return (
    <nav
      className="pages-panel flex flex-col bg-card/40 select-none"
      aria-label="页面列表"
    >
      <div className="panel-heading flex h-8 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>页面</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="page-tab page-tab-add size-5 text-muted-foreground hover:text-foreground"
          aria-label="添加页面"
          title="添加页面"
          onClick={onAddPage}
        >
          <PlusIcon data-icon="inline-start" />
        </Button>
      </div>

      <ScrollArea className="max-h-44">
        <ul className="pages-list flex flex-col gap-0.5 p-1 list-none m-0">
          {pages.map((page) => {
            const active = page.id === activePageId;
            return (
              <li key={page.id} className="relative group/page">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center w-full">
                      <button
                        type="button"
                        className={cn(
                          "page-tab flex flex-1 items-center rounded-sm px-2 py-1 text-xs text-left transition-colors truncate",
                          active
                            ? "page-tab-active bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                        onClick={() => onSelectPage(page.id)}
                      >
                        {page.name}
                      </button>

                      <DropdownMenu
                        open={dropdownPageId === page.id}
                        onOpenChange={(open) =>
                          setDropdownPageId(open ? page.id : null)
                        }
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="size-5 opacity-0 group-hover/page:opacity-100 transition-opacity mr-1"
                            aria-label={`页面 ${page.name} 选项`}
                            onClick={() => setDropdownPageId(page.id)}
                          >
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem onClick={() => startRename(page)}>
                            <PencilIcon data-icon="inline-start" />
                            <span>重命名</span>
                          </DropdownMenuItem>
                          {pages.length > 1 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeletingPage(page)}
                              >
                                <Trash2Icon data-icon="inline-start" />
                                <span>删除</span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </ContextMenuTrigger>

                  <ContextMenuContent className="w-32">
                    <ContextMenuItem onClick={() => startRename(page)}>
                      <PencilIcon data-icon="inline-start" />
                      <span>重命名</span>
                    </ContextMenuItem>
                    {pages.length > 1 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => setDeletingPage(page)}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          <span>删除</span>
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <Dialog
        open={renamingPage !== null}
        onOpenChange={(open) => !open && setRenamingPage(null)}
      >
        <DialogContent position="left-panel">
          <DialogHeader>
            <DialogTitle>重命名页面</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
              }}
              placeholder="输入页面名称"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenamingPage(null)}
            >
              取消
            </Button>
            <Button size="sm" onClick={commitRename}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingPage !== null}
        onOpenChange={(open) => !open && setDeletingPage(null)}
      >
        <AlertDialogContent position="left-panel">
          <AlertDialogHeader>
            <AlertDialogTitle>删除页面</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除页面 "{deletingPage?.name}" 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel size="sm">取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
