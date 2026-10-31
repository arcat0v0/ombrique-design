import { useCallback, useEffect, useRef, useState } from "react";
import {
  CoinsIcon,
  ComponentIcon,
  HistoryIcon,
  LayersIcon,
  MessageSquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DiagnosticsBar } from "./DiagnosticsBar";
import { LayersPanel } from "./LayersPanel";
import { AssetsPanel } from "./AssetsPanel";
import { PagesPanel } from "./PagesPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TokensPanel } from "./TokensPanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { CommentsPanel } from "./CommentsPanel";
import { Toolbar } from "./Toolbar";
import type { ShellActions, ShellView } from "./types";
import "./theme.css";
export interface ShellProps {
  view: ShellView;
  actions: ShellActions;
}

export function Shell({ view, actions }: ShellProps) {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const [leftTab, setLeftTab] = useState<
    "layers" | "assets" | "tokens" | "history" | "comments"
  >("layers");
  const activeTool = view.activeTool ?? "select";

  const handleGroup = useCallback(() => {
    if (!view.selection?.editable) return;
    let entered: string | null = null;
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.prompt === "function"
      ) {
        entered = window.prompt("编组名称", "Group");
        if (entered === null) return;
      }
    } catch {
      entered = null;
    }
    const name = entered?.trim() || "Group";
    actions.groupSelection(name);
  }, [actions, view.selection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) {
          actions.redo();
        } else {
          actions.undo();
        }
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        actions.duplicateSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) {
          actions.ungroupSelection();
        } else {
          handleGroup();
        }
        return;
      }
      if (!mod && key === "c") {
        event.preventDefault();
        actions.setTool?.("comment");
        setLeftTab("comments");
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        actions.deleteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, handleGroup]);

  useEffect(() => {
    if (!actions.updateCanvasBounds || !canvasMountRef.current) return;
    const element = canvasMountRef.current;

    const report = () => {
      const element = canvasMountRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const isJSDOM =
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("jsdom");
      if (!isJSDOM && (rect.width < 200 || rect.height < 150 || rect.x < 120)) {
        return;
      }
      actions.updateCanvasBounds?.({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    report();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => report());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", report);
    return () => window.removeEventListener("resize", report);
  }, [actions.updateCanvasBounds]);

  useEffect(() => {
    if (view.commentsTabRequest) setLeftTab("comments");
  }, [view.commentsTabRequest]);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="shell flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="shell-topbar flex-none">
          {(() => {
            const isEditable = Boolean(view.selection?.editable);
            const isNonRoot = Boolean(view.selection?.id.includes("/"));
            const canCreateComponent = isEditable && isNonRoot;
            const createDisabledReason = !view.selection
              ? "未选中可编辑图层"
              : !isNonRoot
                ? "根级 Frame 不能创建为组件"
                : !isEditable
                  ? (view.selection.readOnlyReason ?? "当前节点不可编辑")
                  : undefined;
            const rawName = view.selection?.name ?? "Component";
            const createComponentNameDefault =
              rawName.charAt(0).toUpperCase() + rawName.slice(1);

            return (
              <Toolbar
                canUndo={view.canUndo}
                canRedo={view.canRedo}
                canDelete={Boolean(view.selection?.editable)}
                zoom={view.zoom}
                stats={view.stats}
                busy={view.busy}
                canGroup={Boolean(view.selection?.editable)}
                canUngroup={Boolean(
                  view.selection?.editable &&
                    (view.selection.kind === "group" ||
                      view.selection.tag.toLowerCase() === "group" ||
                      view.selection.styles.some(
                        (s) => s.key === "display" && s.value === "contents",
                      )),
                )}
                canFlatten={Boolean(
                  view.selection &&
                    view.selection.tag.toLowerCase() === "boolean",
                )}
                canCreateComponent={canCreateComponent}
                createComponentNameDefault={createComponentNameDefault}
                createDisabledReason={createDisabledReason}
                onCreateComponent={(name) => actions.createComponent?.(name)}
                onGroupSelection={handleGroup}
                onUngroupSelection={actions.ungroupSelection}
                onFlattenSelection={actions.flattenSelection}
                onInsertImage={actions.insertImage}
                onOpenProject={actions.openProject}
                onOpenExample={actions.openExample}
                onOpenBundle={actions.openBundle}
                onBundleProject={actions.bundleProject}
                onUndo={actions.undo}
                onRedo={actions.redo}
                onDeleteSelection={actions.deleteSelection}
                onCreateNode={actions.createNode}
                onZoomTo={actions.zoomTo}
                onZoomToFit={actions.zoomToFit}
                onExport={actions.exportPage}
                onToggleFullscreen={actions.toggleFullscreen}
                onToggleDevtools={actions.toggleDevtools}
                onReloadRenderer={actions.reloadRenderer}
                onMinimizeWindow={actions.minimizeWindow}
                onToggleWindowMaximize={actions.toggleWindowMaximize}
                onCloseWindow={actions.closeWindow}
                prototypeMode={view.prototypeMode}
                showHotspots={view.showHotspots}
                onTogglePrototypeMode={actions.togglePrototypeMode}
                onToggleHotspots={actions.toggleHotspots}
              />
            );
          })()}
        </header>

        <div className="shell-body flex flex-1 min-h-0 w-full overflow-hidden">
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full w-full"
          >
            <ResizablePanel
              defaultSize={240}
              minSize={180}
              maxSize={480}
              className="shell-left flex flex-col border-r border-border bg-card/30"
            >
              <PagesPanel
                pages={view.pages}
                activePageId={view.activePageId}
                onSelectPage={actions.selectPage}
                onAddPage={actions.addPage}
                onRenamePage={actions.renamePage}
                onDeletePage={actions.deletePage}
              />
              <div
                role="tablist"
                aria-label="左侧面板标签"
                className="flex items-center border-t border-b border-border bg-muted/30 px-2 py-0.5 gap-1 select-none"
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const tabs: Array<
                      "layers" | "assets" | "tokens" | "history" | "comments"
                    > = ["layers", "assets", "tokens", "history", "comments"];
                    const curIdx = tabs.indexOf(leftTab);
                    const delta = e.key === "ArrowRight" ? 1 : -1;
                    const nextIdx =
                      (curIdx + delta + tabs.length) % tabs.length;
                    setLeftTab(tabs[nextIdx] ?? "layers");
                  }
                }}
              >
                <Button
                  type="button"
                  role="tab"
                  aria-selected={leftTab === "layers"}
                  variant={leftTab === "layers" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setLeftTab("layers")}
                  className="h-6 gap-1 px-2 text-[11px] font-normal"
                  aria-label="查看图层列表"
                >
                  <LayersIcon className="size-3 text-muted-foreground" />
                  <span>图层</span>
                  {view.layers.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono">
                      {view.layers.length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={leftTab === "assets"}
                  variant={leftTab === "assets" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setLeftTab("assets")}
                  className="h-6 gap-1 px-2 text-[11px] font-normal"
                  aria-label="查看组件资产"
                >
                  <ComponentIcon className="size-3 text-muted-foreground" />
                  <span>资产</span>
                  {view.components && view.components.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono">
                      {view.components.length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={leftTab === "tokens"}
                  variant={leftTab === "tokens" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setLeftTab("tokens")}
                  className="h-6 gap-1 px-2 text-[11px] font-normal"
                  aria-label="查看设计变量"
                >
                  <CoinsIcon className="size-3 text-muted-foreground" />
                  <span>变量</span>
                  {view.tokens && view.tokens.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono">
                      {view.tokens.length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={leftTab === "history"}
                  variant={leftTab === "history" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setLeftTab("history")}
                  className="h-6 gap-1 px-2 text-[11px] font-normal"
                  aria-label="查看版本历史"
                >
                  <HistoryIcon className="size-3 text-muted-foreground" />
                  <span>历史</span>
                  {view.history && view.history.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono">
                      {view.history.length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={leftTab === "comments"}
                  variant={leftTab === "comments" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setLeftTab("comments")}
                  className="h-6 gap-1 px-2 text-[11px] font-normal"
                  aria-label="查看评论讨论"
                >
                  <MessageSquareIcon className="size-3 text-muted-foreground" />
                  <span>评论</span>
                  {view.comments && view.comments.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono">
                      {view.comments.filter((c) => !c.resolved).length}
                    </span>
                  )}
                </Button>
              </div>

              {leftTab === "layers" ? (
                <LayersPanel
                  layers={view.layers}
                  selectedLayerId={view.selection?.id ?? null}
                  onSelectLayer={actions.selectLayer}
                  onSetName={actions.setName}
                  onRenameLayer={actions.renameLayer}
                  onToggleHidden={actions.toggleHidden}
                  onToggleLocked={actions.toggleLocked}
                  onToggleHiddenForLayer={actions.toggleHiddenForLayer}
                  onToggleLockedForLayer={actions.toggleLockedForLayer}
                  onDeleteSelection={actions.deleteSelection}
                  onReparentLayer={actions.reparentLayer}
                  onReorderLayer={actions.reorderLayer}
                />
              ) : leftTab === "assets" ? (
                <AssetsPanel
                  components={view.components}
                  onInsertComponent={(name) =>
                    actions.createComponentInstance?.(name)
                  }
                />
              ) : leftTab === "tokens" ? (
                <TokensPanel
                  tokens={view.tokens}
                  modes={view.tokenModes}
                  onAddMode={actions.addTokenMode}
                  onRenameMode={actions.renameTokenMode}
                  onDeleteMode={actions.deleteTokenMode}
                  onRefreshToken={actions.refreshTokens}
                  onSetToken={actions.setToken}
                  onCreateToken={actions.createToken}
                />
              ) : leftTab === "history" ? (
                <VersionHistoryPanel
                  gitStatus={view.gitStatus}
                  history={view.history}
                  branches={view.branches}
                  isHistoryPreview={view.isHistoryPreview}
                  previewCommit={view.previewCommit}
                  onSaveVersion={actions.saveVersion}
                  onRefreshHistory={actions.refreshHistory}
                  onPreviewVersion={actions.previewVersion}
                  onExitHistoryPreview={actions.exitHistoryPreview}
                  onRestoreVersion={actions.restoreVersion}
                  onCreateBranch={actions.createBranch}
                  onSwitchBranch={actions.switchBranch}
                />
              ) : (
                <CommentsPanel
                  comments={view.comments}
                  activeCommentThreadId={view.activeCommentThreadId}
                  onSelectCommentThread={actions.selectCommentThread}
                  onCreateCommentThread={actions.createCommentThread}
                  onReplyCommentThread={actions.replyCommentThread}
                  onResolveCommentThread={actions.resolveCommentThread}
                  onUnresolveCommentThread={actions.unresolveCommentThread}
                  onDeleteCommentThread={actions.deleteCommentThread}
                  onDeleteCommentMessage={actions.deleteCommentMessage}
                />
              )}
            </ResizablePanel>
            <ResizableHandle withHandle className="hover:bg-primary/20" />

            <ResizablePanel
              minSize={320}
              className="shell-center relative flex-1 bg-background"
            >
              <main
                className={cn(
                  "size-full overflow-hidden",
                  activeTool === "hand" ? "cursor-grab" : "cursor-default",
                )}
                data-testid="canvas-slot"
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes(
                      "application/ombrique-component",
                    ) ||
                    e.dataTransfer.types.includes("text/plain")
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={(e) => {
                  const compName =
                    e.dataTransfer.getData("application/ombrique-component") ||
                    e.dataTransfer.getData("text/plain");
                  if (!compName) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const zoom = view.zoom || 1;
                  const x = Math.round((e.clientX - rect.left) / zoom);
                  const y = Math.round((e.clientY - rect.top) / zoom);
                  actions.createComponentInstance?.(compName, { x, y });
                }}
              >
                {view.isHistoryPreview && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full bg-card/95 border border-primary/40 px-4 py-1.5 shadow-lg backdrop-blur text-xs">
                    <span className="text-primary font-medium flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-primary animate-pulse" />
                      正在预览历史版本: {view.previewCommit?.shortHash} (
                      {view.previewCommit?.message})
                    </span>
                    <Button
                      variant="default"
                      size="xs"
                      className="h-6 text-[11px]"
                      onClick={() =>
                        view.previewCommit &&
                        actions.restoreVersion?.(view.previewCommit)
                      }
                    >
                      恢复此版本
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 text-[11px]"
                      onClick={() => actions.exitHistoryPreview?.()}
                    >
                      退出预览
                    </Button>
                  </div>
                )}
                <div
                  ref={canvasMountRef}
                  id="canvas-mount"
                  className="canvas-mount size-full"
                />
              </main>
            </ResizablePanel>

            <ResizableHandle withHandle className="hover:bg-primary/20" />

            <ResizablePanel
              defaultSize={280}
              minSize={220}
              maxSize={480}
              className="shell-right flex flex-col border-l border-border bg-card/30"
            >
              <PropertiesPanel
                selection={view.selection}
                tokens={view.tokens}
                tokenModes={view.tokenModes}
                pages={view.pages}
                activePageId={view.activePageId}
                onSetStyle={actions.setStyle}
                onSetAttrs={actions.setAttrs}
                onSetText={actions.setText}
                onSetName={actions.setName}
                onToggleHidden={actions.toggleHidden}
                onToggleLocked={actions.toggleLocked}
                onDetachInstance={actions.detachInstance}
                onFlattenSelection={actions.flattenSelection}
                onExportNode={actions.exportNode}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <DiagnosticsBar
          diagnostics={view.diagnostics}
          notice={view.notice}
          onDismissNotice={actions.dismissNotice}
        />
      </div>
    </TooltipProvider>
  );
}
