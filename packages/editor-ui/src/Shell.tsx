import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SlidersHorizontalIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CanvasControls } from "./CanvasControls";
import { cn } from "@/lib/utils";
import { DiagnosticsBar } from "./DiagnosticsBar";
import {
  EditorRail,
  InspectorDrawer,
  LeftDrawer,
  PagesDrawer,
  useEditorWorkspace,
  type DrawerTab,
} from "./EditorWorkspace";
import { LayersPanel } from "./LayersPanel";
import { AssetsPanel } from "./AssetsPanel";
import { PagesPanel } from "./PagesPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TokensPanel, encodeTokenCellRef } from "./TokensPanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { TransactionHistoryPanel } from "./TransactionHistoryPanel";
import { CommentsPanel } from "./CommentsPanel";
import { Toolbar } from "./Toolbar";
import { WindowControls } from "./WindowControls";
import { isTypingTarget, resolveShortcut } from "./shortcuts";
import type { ShellActions, ShellView } from "./types";
import { Workspace } from "./Workspace";
import "./theme.css";

export interface ShellProps {
  view: ShellView;
  actions: ShellActions;
}

function projectNameOf(root: string | null): string | undefined {
  if (!root) return undefined;
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

export function Shell({ view, actions }: ShellProps) {
  const windowControls =
    view.platform === "linux" ? (
      <WindowControls
        maximized={view.windowMaximized}
        onMinimize={actions.minimizeWindow}
        onToggleMaximize={actions.toggleWindowMaximize}
        onClose={actions.closeWindow}
      />
    ) : undefined;
  if (!view.projectRoot) {
    return (
      <Workspace
        recentProjects={view.recentProjects}
        busy={view.busy}
        notice={view.notice}
        windowControls={windowControls}
        titleBarDrag={Boolean(windowControls)}
        onOpenRecent={(root) => actions.openRecentProject?.(root)}
        onOpenProject={actions.openProject}
        onCreateProject={() => actions.createProject?.()}
        onOpenBundle={
          actions.openBundle
            ? () => {
                void actions.openBundle?.();
              }
            : undefined
        }
        onOpenExample={actions.openExample}
        onRemoveRecent={actions.removeRecentProject}
        onDismissNotice={actions.dismissNotice}
      />
    );
  }
  return (
    <EditorShell
      view={view}
      actions={actions}
      windowControls={windowControls}
    />
  );
}

function EditorShell({
  view,
  actions,
  windowControls,
}: ShellProps & { windowControls?: ReactNode }) {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const [renameLayerId, setRenameLayerId] = useState<string | null>(null);
  const activeTool = view.activeTool ?? "select";
  const selectionId = view.selection?.id;
  const { state, setDrawerTab, hideInspector, showInspector } =
    useEditorWorkspace(
      view.commentsTabRequest,
      view.renameRequest,
      selectionId,
      view.activeTool,
    );

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
      if (isTypingTarget(event.target as HTMLElement | null)) return;
      const command = resolveShortcut(event, {
        hasSelection: Boolean(view.selection),
      });
      if (!command) return;
      event.preventDefault();
      if (command.kind === "group") {
        handleGroup();
        return;
      }
      actions.runShortcut?.(command);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, handleGroup, view.selection]);

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
      if (!isJSDOM && (rect.width < 200 || rect.height < 150)) {
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
    if (!view.renameRequest) return;
    if (view.selection?.id) setRenameLayerId(view.selection.id);
  }, [view.renameRequest, view.selection]);

  const renderDrawerContent = (tab: Exclude<DrawerTab, "pages">) => {
    switch (tab) {
      case "layers":
        return (
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
            renameLayerId={renameLayerId}
            onRenameHandled={() => setRenameLayerId(null)}
          />
        );
      case "assets":
        return (
          <AssetsPanel
            components={view.components}
            onInsertComponent={(name) =>
              actions.createComponentInstance?.(name)
            }
          />
        );
      case "tokens":
        return (
          <TokensPanel
            tokens={view.tokens}
            modes={view.tokenModes}
            onAddMode={actions.addTokenMode}
            onRenameMode={actions.renameTokenMode}
            onDeleteMode={actions.deleteTokenMode}
            onRefreshToken={actions.refreshTokens}
            onSetToken={(name, value, _axis, _axisValue, selectors) =>
              actions.setToken?.(
                name,
                value,
                selectors ? encodeTokenCellRef(selectors) : undefined,
              )
            }
            onCreateToken={actions.createToken}
          />
        );
      case "transactions":
        return (
          <TransactionHistoryPanel
            entries={view.editHistory}
            onRefresh={actions.refreshEditHistory}
            onRestore={actions.restoreEditHistory}
          />
        );
      case "history":
        return (
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
        );
      case "comments":
        return (
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
        );
    }
  };

  const drawerTab = state.drawerTab;
  const inspectorOpen = Boolean(view.selection && state.inspectorVisible);

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
                projectName={projectNameOf(view.projectRoot)}
                recentProjects={view.recentProjects}
                onOpenProject={actions.openProject}
                onCreateProject={actions.createProject}
                onOpenExample={actions.openExample}
                onOpenBundle={actions.openBundle}
                onOpenRecentProject={actions.openRecentProject}
                onShowWorkspace={actions.showWorkspace}
                onBundleProject={actions.bundleProject}
                onUndo={actions.undo}
                onRedo={actions.redo}
                onDeleteSelection={actions.deleteSelection}
                onZoomTo={actions.zoomTo}
                onZoomToFit={actions.zoomToFit}
                onExport={actions.exportPage}
                onToggleFullscreen={actions.toggleFullscreen}
                onToggleDevtools={actions.toggleDevtools}
                onReloadRenderer={actions.reloadRenderer}
                prototypeMode={view.prototypeMode}
                showHotspots={view.showHotspots}
                onTogglePrototypeMode={actions.togglePrototypeMode}
                onToggleHotspots={actions.toggleHotspots}
                windowControls={windowControls}
                titleBarDrag={Boolean(windowControls)}
              />
            );
          })()}
        </header>

        <div className="shell-body relative flex min-h-0 w-full flex-1 overflow-hidden">
          <EditorRail drawerTab={drawerTab} onChange={setDrawerTab} />

          <main
            className={cn(
              "canvas-stage relative min-w-0 flex-1 overflow-hidden bg-background",
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
            <div
              ref={canvasMountRef}
              id="canvas-mount"
              className="canvas-mount absolute inset-0"
            />

            {view.isHistoryPreview && (
              <div className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#3a3a3a] bg-[#171717] px-4 py-1.5 text-xs text-[#b4b4b4]">
                <span className="flex items-center gap-1.5 text-white">
                  <span className="size-2 rounded-full bg-[#c6f24e]" />
                  正在预览历史版本: {view.previewCommit?.shortHash} (
                  {view.previewCommit?.message})
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  className="h-6 rounded-md text-[11px]"
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
                  className="h-6 rounded-md text-[11px]"
                  onClick={() => actions.exitHistoryPreview?.()}
                >
                  退出预览
                </Button>
              </div>
            )}

            <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border border-[#242424] bg-[#141414] px-3 py-1.5 text-xs text-[#b4b4b4]">
              <SparklesIcon className="size-3.5 text-[#c6f24e]" />
              <span>
                {view.pages.find((page) => page.id === view.activePageId)
                  ?.name ?? "画布"}
              </span>
            </div>

            <div className="pointer-events-none absolute inset-0 z-20">
              {!view.selection && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-sm text-[#949494]">
                  未选中图层
                </div>
              )}

              {drawerTab === "pages" ? (
                <PagesDrawer onClose={() => setDrawerTab(null)}>
                  <PagesPanel
                    pages={view.pages}
                    activePageId={view.activePageId}
                    onSelectPage={actions.selectPage}
                    onAddPage={actions.addPage}
                    onRenamePage={actions.renamePage}
                    onDeletePage={actions.deletePage}
                  />
                </PagesDrawer>
              ) : drawerTab ? (
                <LeftDrawer tab={drawerTab} onClose={() => setDrawerTab(null)}>
                  {renderDrawerContent(drawerTab)}
                </LeftDrawer>
              ) : null}

              {inspectorOpen && (
                <InspectorDrawer onClose={hideInspector}>
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
                </InspectorDrawer>
              )}

              <div
                className="pointer-events-none absolute right-4 bottom-10 z-30"
                data-ui
              >
                <div className="pointer-events-auto" data-ui>
                  <CanvasControls
                    zoom={view.zoom}
                    hasSelection={Boolean(view.selection)}
                    inspectorVisible={state.inspectorVisible}
                    onZoomOut={() => actions.zoomTo(view.zoom / 1.25)}
                    onZoomIn={() => actions.zoomTo(view.zoom * 1.25)}
                    onZoomToFit={actions.zoomToFit}
                    onToggleInspector={() => {
                      if (state.inspectorVisible) hideInspector();
                      else showInspector();
                    }}
                  />
                </div>
              </div>

              <DiagnosticsBar
                diagnostics={view.diagnostics}
                notice={view.notice}
                onDismissNotice={actions.dismissNotice}
              />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="显示属性面板"
                    onClick={showInspector}
                    className={cn(
                      "pointer-events-auto absolute top-3 right-3 z-30 size-8 rounded-full border border-[#303030] bg-[#171717] text-[#b4b4b4] hover:bg-[#242424] hover:text-white",
                      (!view.selection || state.inspectorVisible) && "hidden",
                    )}
                  >
                    <SlidersHorizontalIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">显示属性面板</TooltipContent>
              </Tooltip>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
