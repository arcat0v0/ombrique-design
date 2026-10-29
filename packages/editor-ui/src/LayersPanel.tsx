import {
  ChevronDownIcon,
  ChevronRightIcon,
  ComponentIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  FrameIcon,
  LockIcon,
  PencilIcon,
  SearchIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
  UnlockIcon,
  XIcon,
} from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LayerNode } from "./types";

export interface LayersPanelProps {
  layers: LayerNode[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onSetName?: (name: string) => void;
  onRenameLayer?: (layerId: string, name: string) => void;
  onToggleHidden?: () => void;
  onToggleLocked?: () => void;
  onToggleHiddenForLayer?: (layerId: string, hidden: boolean) => void;
  onToggleLockedForLayer?: (layerId: string, locked: boolean) => void;
  onDeleteSelection?: () => void;
}

function layerIcon(kind: LayerNode["kind"]) {
  switch (kind) {
    case "frame":
      return FrameIcon;
    case "group":
      return FolderIcon;
    case "text":
      return TypeIcon;
    case "component":
      return ComponentIcon;
    default:
      return SquareIcon;
  }
}

function filterNode(node: LayerNode, query: string): LayerNode | null {
  const matchesSelf =
    node.name.toLowerCase().includes(query) ||
    node.tag.toLowerCase().includes(query);
  const filteredChildren = node.children
    .map((child) => filterNode(child, query))
    .filter((n): n is LayerNode => n !== null);

  if (matchesSelf || filteredChildren.length > 0) {
    return {
      ...node,
      children: filteredChildren,
    };
  }
  return null;
}

export function LayersPanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onSetName,
  onRenameLayer,
  onToggleHidden,
  onToggleLocked,
  onToggleHiddenForLayer,
  onToggleLockedForLayer,
  onDeleteSelection,
}: LayersPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [search, setSearch] = useState("");

  const toggleCollapsed = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startRename = (node: LayerNode, e?: MouseEvent) => {
    e?.stopPropagation();
    onSelectLayer(node.id);
    setEditingId(node.id);
    setEditingName(node.name);
  };

  const commitRename = (node: LayerNode) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== node.name) {
      if (onRenameLayer) {
        onRenameLayer(node.id, trimmed);
      } else {
        onSetName?.(trimmed);
      }
    }
    setEditingId(null);
  };

  const filteredLayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return layers;
    return layers
      .map((l) => filterNode(l, q))
      .filter((n): n is LayerNode => n !== null);
  }, [layers, search]);

  const renderItem = (node: LayerNode) => {
    const selected = node.id === selectedLayerId;
    const Icon = layerIcon(node.kind);
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isEditing = editingId === node.id;

    const handleClick = (event: MouseEvent) => {
      event.stopPropagation();
      onSelectLayer(node.id);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectLayer(node.id);
      }
    };

    const handleContextMenuAction = (action: () => void) => {
      if (node.id !== selectedLayerId) {
        onSelectLayer(node.id);
      }
      action();
    };

    return (
      <div key={node.id} className="flex flex-col">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              tabIndex={0}
              role="treeitem"
              aria-selected={selected}
              data-hidden={node.hidden ? "true" : undefined}
              data-generated={node.generated ? "true" : undefined}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              onDoubleClick={(e) => startRename(node, e)}
              style={{ paddingLeft: 8 + node.depth * 12 }}
              className={cn(
                "layer-row group flex h-7 w-full max-w-full items-center gap-1.5 pr-2 text-left text-xs font-normal outline-none cursor-pointer transition-colors select-none overflow-hidden box-border",
                selected
                  ? "layer-row-selected bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                node.hidden && "layer-row-hidden opacity-40",
              )}
            >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={
                    isCollapsed ? `展开 ${node.name}` : `折叠 ${node.name}`
                  }
                  className="flex size-4 items-center justify-center p-0 border-none bg-transparent text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                  onClick={(e) => toggleCollapsed(node.id, e)}
                >
                  {isCollapsed ? (
                    <ChevronRightIcon className="size-3" />
                  ) : (
                    <ChevronDownIcon className="size-3" />
                  )}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}

              <Icon className="size-3.5 shrink-0 opacity-70" />

              {isEditing ? (
                <Input
                  autoFocus
                  value={editingName}
                  className="h-5 flex-1 px-1 py-0 text-xs font-normal leading-none"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => commitRename(node)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename(node);
                    } else if (e.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <span className="layer-name min-w-0 flex-1 truncate">
                  {node.name}
                </span>
              )}

              <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                <button
                  type="button"
                  title={node.locked ? "解锁图层" : "锁定图层"}
                  aria-label={node.locked ? "解锁图层" : "锁定图层"}
                  className={cn(
                    "flex size-5 items-center justify-center rounded p-0 border-none bg-transparent transition-opacity cursor-pointer text-muted-foreground hover:text-foreground",
                    node.locked
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleLockedForLayer) {
                      onToggleLockedForLayer(node.id, !node.locked);
                    } else {
                      if (node.id !== selectedLayerId) {
                        onSelectLayer(node.id);
                      }
                      onToggleLocked?.();
                    }
                  }}
                >
                  {node.locked ? (
                    <LockIcon className="layer-lock size-3 text-foreground" />
                  ) : (
                    <UnlockIcon className="size-3" />
                  )}
                </button>
                <button
                  type="button"
                  title={node.hidden ? "显示图层" : "隐藏图层"}
                  aria-label={node.hidden ? "显示图层" : "隐藏图层"}
                  className={cn(
                    "flex size-5 items-center justify-center rounded p-0 border-none bg-transparent transition-opacity cursor-pointer text-muted-foreground hover:text-foreground",
                    node.hidden
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleHiddenForLayer) {
                      onToggleHiddenForLayer(node.id, !node.hidden);
                    } else {
                      if (node.id !== selectedLayerId) {
                        onSelectLayer(node.id);
                      }
                      onToggleHidden?.();
                    }
                  }}
                >
                  {node.hidden ? (
                    <EyeOffIcon className="size-3 text-foreground" />
                  ) : (
                    <EyeIcon className="size-3" />
                  )}
                </button>
                {node.generated && (
                  <Badge
                    variant="outline"
                    className="layer-badge h-4 px-1 text-[9px] font-normal shrink-0"
                  >
                    代码生成
                  </Badge>
                )}
                <span className="layer-tag font-mono text-[10px] text-muted-foreground/50 shrink-0 select-none">
                  {node.tag}
                </span>
              </div>
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-36">
            <ContextMenuItem
              onClick={() => handleContextMenuAction(() => onToggleHidden?.())}
            >
              {node.hidden ? (
                <>
                  <EyeIcon data-icon="inline-start" />
                  <span>显示图层</span>
                </>
              ) : (
                <>
                  <EyeOffIcon data-icon="inline-start" />
                  <span>隐藏图层</span>
                </>
              )}
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleContextMenuAction(() => onToggleLocked?.())}
            >
              {node.locked ? (
                <>
                  <UnlockIcon data-icon="inline-start" />
                  <span>解锁图层</span>
                </>
              ) : (
                <>
                  <LockIcon data-icon="inline-start" />
                  <span>锁定图层</span>
                </>
              )}
            </ContextMenuItem>

            <ContextMenuItem onClick={() => startRename(node)}>
              <PencilIcon data-icon="inline-start" />
              <span>重命名</span>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              variant="destructive"
              onClick={() =>
                handleContextMenuAction(() => onDeleteSelection?.())
              }
            >
              <Trash2Icon data-icon="inline-start" />
              <span>删除</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {hasChildren && !isCollapsed && (
          <div className="flex flex-col">
            {node.children.map((child) => renderItem(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      className="layers-panel flex flex-1 flex-col min-h-0 border-t border-border bg-card/40"
      aria-label="图层树"
    >
      <div className="panel-heading flex h-8 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
        <span>图层</span>
        {layers.length > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {layers.length}
          </span>
        )}
      </div>

      <div className="px-2 pb-1.5">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索图层..."
            className="h-6 pl-6 pr-6 text-[11px] bg-background/50"
            aria-label="搜索图层"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 size-4 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label="清除搜索"
            >
              <XIcon className="size-2.5" />
            </Button>
          )}
        </div>
      </div>

      {filteredLayers.length === 0 ? (
        <div className="layers-empty flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          {search ? "未找到匹配图层" : "暂无图层"}
        </div>
      ) : (
        <ScrollArea className="flex-1 w-full overflow-hidden">
          <div
            role="tree"
            className="flex flex-col py-1 w-full overflow-hidden"
          >
            {filteredLayers.map((layer) => renderItem(layer))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}
