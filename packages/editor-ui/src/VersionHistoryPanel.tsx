import { useState } from "react";
import {
  GitBranchIcon,
  GitCommitIcon,
  HistoryIcon,
  PlusIcon,
  RotateCcwIcon,
  EyeIcon,
  SaveIcon,
} from "lucide-react";
import type { GitBranchList, GitCommit, GitStatus } from "@ombrique/protocol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export interface VersionHistoryPanelProps {
  gitStatus?: GitStatus | null;
  history?: GitCommit[];
  branches?: GitBranchList | null;
  isHistoryPreview?: boolean;
  previewCommit?: GitCommit | null;
  onSaveVersion?: (message: string) => Promise<boolean>;
  onRefreshHistory?: () => Promise<void>;
  onPreviewVersion?: (commit: GitCommit) => Promise<void>;
  onExitHistoryPreview?: () => Promise<void>;
  onRestoreVersion?: (commit: GitCommit) => Promise<void>;
  onCreateBranch?: (branchName: string) => Promise<boolean>;
  onSwitchBranch?: (branchName: string) => Promise<boolean>;
}

export function VersionHistoryPanel({
  gitStatus,
  history = [],
  branches,
  isHistoryPreview = false,
  previewCommit = null,
  onSaveVersion,
  onPreviewVersion,
  onExitHistoryPreview,
  onRestoreVersion,
  onCreateBranch,
  onSwitchBranch,
}: VersionHistoryPanelProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [createBranchDialogOpen, setCreateBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [branchError, setBranchError] = useState<string | null>(null);

  const [restoreConfirmCommit, setRestoreConfirmCommit] =
    useState<GitCommit | null>(null);

  const currentBranch = branches?.current ?? gitStatus?.currentBranch ?? "main";
  const branchList = branches?.branches ?? [];

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveMessage.trim() || !onSaveVersion) return;
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await onSaveVersion(saveMessage.trim());
      if (ok) {
        setSaveMessage("");
        setSaveDialogOpen(false);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !onCreateBranch) return;
    setBranchError(null);
    try {
      const ok = await onCreateBranch(newBranchName.trim());
      if (ok) {
        setNewBranchName("");
        setCreateBranchDialogOpen(false);
      }
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSwitch = async (branch: string) => {
    if (branch === currentBranch || !onSwitchBranch) return;
    try {
      await onSwitchBranch(branch);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRestoreSubmit = async () => {
    if (!restoreConfirmCommit || !onRestoreVersion) return;
    try {
      await onRestoreVersion(restoreConfirmCommit);
      setRestoreConfirmCommit(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b border-border p-2 gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              className="h-7 max-w-[160px] gap-1.5 truncate text-xs"
            >
              <GitBranchIcon className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{currentBranch}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {branchList.map((branch) => (
              <DropdownMenuItem
                key={branch}
                onClick={() => handleSwitch(branch)}
                className="text-xs cursor-pointer flex items-center justify-between"
              >
                <span className="truncate">{branch}</span>
                {branch === currentBranch && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">
                    当前
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setCreateBranchDialogOpen(true)}
            title="创建新分支"
          >
            <PlusIcon className="size-3.5" />
            <span>新分支</span>
          </Button>

          <Button
            variant="default"
            size="xs"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setSaveDialogOpen(true)}
            title="保存版本 (Commit)"
          >
            <SaveIcon className="size-3.5" />
            <span>保存版本</span>
          </Button>
        </div>
      </div>

      {isHistoryPreview && (
        <div className="flex items-center justify-between bg-primary/10 border-b border-primary/20 px-3 py-1.5 text-xs">
          <div className="flex items-center gap-1.5 truncate">
            <EyeIcon className="size-3.5 text-primary shrink-0" />
            <span className="truncate">
              预览版本: {previewCommit?.shortHash} ({previewCommit?.message})
            </span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onExitHistoryPreview?.()}
            className="h-6 text-xs text-primary hover:text-primary"
          >
            退出预览
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col p-2 gap-2">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
              <HistoryIcon className="size-8 opacity-40" />
              <span className="text-xs">暂无版本历史记录</span>
              <span className="text-[11px] opacity-75">
                保存版本后可在此查看提交历史与回滚
              </span>
            </div>
          ) : (
            history.map((commit) => {
              const isCurrentPreview =
                isHistoryPreview && previewCommit?.hash === commit.hash;
              const dateStr = commit.date
                ? new Date(commit.date).toLocaleString(undefined, {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <div
                  key={commit.hash}
                  className={`flex flex-col rounded-md border p-2.5 gap-2 text-xs transition-colors ${
                    isCurrentPreview
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <GitCommitIcon className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                        {commit.shortHash}
                      </span>
                      <span
                        className="font-medium truncate"
                        title={commit.message}
                      >
                        {commit.message}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{commit.author}</span>
                    <span className="shrink-0">{dateStr}</span>
                  </div>

                  {commit.changedPages && commit.changedPages.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {commit.changedPages.map((page) => (
                        <Badge
                          key={page}
                          variant="secondary"
                          className="text-[10px] h-4 px-1"
                        >
                          {page}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Separator className="my-0.5" />

                  <div className="flex items-center justify-end gap-1">
                    {isCurrentPreview ? (
                      <Button
                        variant="secondary"
                        size="xs"
                        className="h-6 text-[11px]"
                        onClick={() => onExitHistoryPreview?.()}
                      >
                        退出预览
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-6 text-[11px] gap-1"
                        aria-label={`预览版本: ${commit.shortHash}`}
                        onClick={() => onPreviewVersion?.(commit)}
                      >
                        <EyeIcon className="size-3" />
                        <span>预览</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="xs"
                      className="h-6 text-[11px] gap-1"
                      aria-label={`恢复版本: ${commit.shortHash}`}
                      onClick={() => setRestoreConfirmCommit(commit)}
                    >
                      <RotateCcwIcon className="size-3" />
                      <span>恢复</span>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>保存设计版本</DialogTitle>
            <DialogDescription>
              将当前项目的未提交设计变更保存为 Git 提交。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="version-message" className="text-xs">
                版本描述
              </Label>
              <Input
                id="version-message"
                value={saveMessage}
                onChange={(e) => setSaveMessage(e.target.value)}
                placeholder="例如: 更新首页头部设计、调整按钮间距"
                autoFocus
                className="text-xs"
              />
              {saveError && (
                <span className="text-xs text-destructive">{saveError}</span>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSaveDialogOpen(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button
                type="submit"
                aria-label="确认保存版本"
                disabled={!saveMessage.trim() || saving}
              >
                {saving ? "正在保存..." : "确认保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createBranchDialogOpen}
        onOpenChange={setCreateBranchDialogOpen}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>创建新分支</DialogTitle>
            <DialogDescription>
              从当前分支检出新分支进行独立设计探索。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleCreateBranchSubmit}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="branch-name" className="text-xs">
                分支名称
              </Label>
              <Input
                id="branch-name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/new-landing"
                autoFocus
                className="text-xs font-mono"
              />
              {branchError && (
                <span className="text-xs text-destructive">{branchError}</span>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateBranchDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                aria-label="确认创建分支"
                disabled={!newBranchName.trim()}
              >
                创建并切换
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(restoreConfirmCommit)}
        onOpenChange={(open) => !open && setRestoreConfirmCommit(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>确认恢复此版本？</DialogTitle>
            <DialogDescription>
              恢复将把当前设计稿内容替换为版本{" "}
              <span className="font-mono font-medium">
                {restoreConfirmCommit?.shortHash}
              </span>{" "}
              ({restoreConfirmCommit?.message})。恢复操作支持撤销 (Ctrl+Z)。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRestoreConfirmCommit(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              aria-label="确认恢复此版本"
              onClick={handleRestoreSubmit}
            >
              恢复此版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
