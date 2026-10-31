import { useMemo, useState } from "react";
import {
  ComponentIcon,
  FileCodeIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ComponentItem } from "./types";

export interface AssetsPanelProps {
  components?: ComponentItem[];
  onInsertComponent?: (name: string) => void;
  className?: string;
}

export function AssetsPanel({
  components = [],
  onInsertComponent,
  className,
}: AssetsPanelProps) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = components.filter((comp) => {
      if (!term) return true;
      return (
        comp.name.toLowerCase().includes(term) ||
        comp.file.toLowerCase().includes(term) ||
        Boolean(comp.description?.toLowerCase().includes(term))
      );
    });

    const map = new Map<string, ComponentItem[]>();
    for (const comp of filtered) {
      const list = map.get(comp.file) ?? [];
      list.push(comp);
      map.set(comp.file, list);
    }
    return Array.from(map.entries());
  }, [components, search]);

  const totalCount = components.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "assets-panel flex h-full flex-col select-none",
          className,
        )}
        data-testid="assets-panel"
      >
        <div className="flex flex-col gap-2 border-b border-border p-2">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <ComponentIcon className="size-3.5 text-primary shrink-0" />
              <span className="font-semibold text-xs text-foreground truncate">
                组件资产
              </span>
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[10px] font-mono shrink-0"
              >
                {totalCount}
              </Badge>
            </div>

            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => {
                if (v === "grid" || v === "list") setViewMode(v);
              }}
              size="sm"
              className="h-6 gap-0.5"
              aria-label="视图模式"
            >
              <ToggleGroupItem
                value="grid"
                aria-label="网格视图"
                className="size-6 p-0"
              >
                <LayoutGridIcon className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                aria-label="列表视图"
                className="size-6 p-0"
              >
                <ListIcon className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="relative w-full">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索组件..."
              className="h-7 pl-7 text-xs"
              aria-label="搜索组件"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <ComponentIcon className="size-5 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium text-foreground">
                {search ? "未找到匹配组件" : "暂无可用组件"}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground max-w-[200px]">
                {search
                  ? "请尝试输入其他关键词"
                  : "在画布中选中图层并在工具栏点击「创建组件」，代码将自动保存为可复用组件。"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {groups.map(([file, items]) => (
                <div key={file} className="flex flex-col">
                  <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-1.5 truncate">
                      <FileCodeIcon className="size-3 shrink-0" />
                      <span className="truncate">{file}</span>
                    </div>
                    <span className="text-[9px] shrink-0">{items.length}</span>
                  </div>

                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {items.map((comp) => {
                        const hasVariants = Boolean(
                          comp.axes && comp.axes.length > 0,
                        );
                        return (
                          <button
                            type="button"
                            key={comp.name}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/ombrique-component",
                                comp.name,
                              );
                              e.dataTransfer.setData("text/plain", comp.name);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => onInsertComponent?.(comp.name)}
                            className="group relative flex flex-col gap-1.5 rounded-md border border-border bg-card p-2 text-left hover:border-primary/50 hover:bg-muted/30 cursor-grab active:cursor-grabbing transition-colors"
                            data-testid={`asset-item-${comp.name}`}
                          >
                            <div className="flex aspect-4/3 w-full items-center justify-center rounded bg-muted/50 border border-border/40 text-muted-foreground group-hover:text-primary transition-colors">
                              <ComponentIcon className="size-5" />
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-xs font-medium text-foreground truncate">
                                {comp.name}
                              </span>
                              {hasVariants && (
                                <Badge
                                  variant="secondary"
                                  className="h-3.5 w-fit px-1 text-[8px] font-mono text-primary bg-primary/10"
                                >
                                  变体 ({comp.axes?.length})
                                </Badge>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-border/30">
                      {items.map((comp) => {
                        const hasVariants = Boolean(
                          comp.axes && comp.axes.length > 0,
                        );
                        return (
                          <button
                            type="button"
                            key={comp.name}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/ombrique-component",
                                comp.name,
                              );
                              e.dataTransfer.setData("text/plain", comp.name);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => onInsertComponent?.(comp.name)}
                            className="group flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 cursor-grab active:cursor-grabbing transition-colors"
                            data-testid={`asset-item-${comp.name}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex size-6 shrink-0 items-center justify-center rounded bg-muted/60 border border-border/40 text-muted-foreground group-hover:text-primary transition-colors">
                                <ComponentIcon className="size-3.5" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium text-foreground truncate">
                                  {comp.name}
                                </span>
                                {hasVariants && (
                                  <span className="text-[9px] text-primary font-mono truncate">
                                    变体集 (
                                    {comp.axes?.map((a) => a.name).join(", ")})
                                  </span>
                                )}
                              </div>
                            </div>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  className="size-6 shrink-0 text-muted-foreground group-hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onInsertComponent?.(comp.name);
                                  }}
                                  aria-label={`插入 ${comp.name}`}
                                >
                                  <PlusIcon className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                插入至画布
                              </TooltipContent>
                            </Tooltip>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
