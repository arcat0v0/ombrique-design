import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  CombineIcon,
  ComponentIcon,
  DownloadIcon,
  FolderOpenIcon,
  FrameIcon,
  GroupIcon,
  ImageIcon,
  Loader2Icon,
  Maximize2Icon,
  PackageOpenIcon,
  PenToolIcon,
  PlayIcon,
  Redo2Icon,
  SquareIcon,
  StarIcon,
  TypeIcon,
  Undo2Icon,
  UngroupIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CanvasStats } from "./types";
import { ApplicationMenu } from "./ApplicationMenu";

export type InsertKind =
  | "frame"
  | "rect"
  | "ellipse"
  | "star"
  | "pen"
  | "text"
  | "image";
export interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  canDelete?: boolean;
  zoom: number;
  stats: CanvasStats | null;
  busy: boolean;
  canGroup?: boolean;
  canUngroup?: boolean;
  canFlatten?: boolean;
  canCreateComponent?: boolean;
  createComponentNameDefault?: string;
  createDisabledReason?: string;
  onGroupSelection?: () => void;
  onUngroupSelection?: () => void;
  onFlattenSelection?: () => Promise<boolean> | undefined;
  onInsertImage?: () => Promise<boolean> | undefined;
  onCreateComponent?: (name: string) => void;
  onOpenProject: () => void;
  onOpenExample?: () => void;
  onOpenBundle?: () => Promise<boolean> | undefined;
  onBundleProject?: () => Promise<boolean> | undefined;
  onUndo: () => void;
  onRedo: () => void;
  onCreateNode: (kind: InsertKind) => void;
  onDeleteSelection?: () => void;
  onZoomTo?: (factor: number) => void;
  onZoomToFit: () => void;
  onExport: () => void;
  onToggleFullscreen?: () => void;
  onToggleDevtools?: () => void;
  onReloadRenderer?: () => void;
  onMinimizeWindow?: () => void;
  onToggleWindowMaximize?: () => void;
  onCloseWindow?: () => void;
  prototypeMode?: boolean;
  showHotspots?: boolean;
  onTogglePrototypeMode?: () => void;
  onToggleHotspots?: () => void;
}

const INSERT_TOOLS: Array<{
  kind: InsertKind;
  label: string;
  icon: LucideIcon;
}> = [
  { kind: "frame", label: "Frame", icon: FrameIcon },
  { kind: "rect", label: "矩形", icon: SquareIcon },
  { kind: "ellipse", label: "椭圆", icon: CircleIcon },
  { kind: "star", label: "星形", icon: StarIcon },
  { kind: "pen", label: "钢笔", icon: PenToolIcon },
  { kind: "text", label: "文字", icon: TypeIcon },
  { kind: "image", label: "图片", icon: ImageIcon },
];

export function Toolbar({
  canUndo,
  canRedo,
  canDelete,
  zoom,
  stats,
  busy,
  canGroup = false,
  canUngroup = false,
  canFlatten = false,
  canCreateComponent = false,
  createComponentNameDefault = "Component",
  createDisabledReason,
  onGroupSelection,
  onUngroupSelection,
  onFlattenSelection,
  onInsertImage,
  onCreateComponent,
  onOpenProject,
  onOpenExample,
  onOpenBundle,
  onBundleProject,
  onUndo,
  onRedo,
  onCreateNode,
  onDeleteSelection,
  onZoomTo,
  onZoomToFit,
  onExport,
  onToggleFullscreen,
  onToggleDevtools,
  onReloadRenderer,
  onMinimizeWindow,
  onToggleWindowMaximize,
  onCloseWindow,
  prototypeMode = false,
  showHotspots = false,
  onTogglePrototypeMode,
  onToggleHotspots,
}: ToolbarProps) {
  const [componentDialogOpen, setComponentDialogOpen] = useState(false);
  const [componentName, setComponentName] = useState("");
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-10 w-full items-center justify-between border-b border-border bg-card/80 px-2.5 backdrop-blur-xs select-none">
        <div className="flex items-center gap-1">
          <ApplicationMenu
            canUndo={canUndo}
            canRedo={canRedo}
            canDelete={canDelete}
            zoom={zoom}
            busy={busy}
            onOpenProject={onOpenProject}
            onOpenExample={onOpenExample}
            onExport={onExport}
            onUndo={onUndo}
            onRedo={onRedo}
            onDeleteSelection={onDeleteSelection}
            onZoomTo={onZoomTo}
            onZoomToFit={onZoomToFit}
            onToggleFullscreen={onToggleFullscreen}
            onToggleDevtools={onToggleDevtools}
            onReloadRenderer={onReloadRenderer}
            onMinimizeWindow={onMinimizeWindow}
            onToggleWindowMaximize={onToggleWindowMaximize}
            onCloseWindow={onCloseWindow}
          />

          <Separator orientation="vertical" className="mx-1 h-4" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label="打开项目"
                title="打开项目"
                disabled={busy}
                className="h-7 gap-1 px-2 text-xs font-normal"
              >
                <FolderOpenIcon data-icon="inline-start" />
                <span>打开项目</span>
                <ChevronDownIcon className="size-3 opacity-60 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={onOpenProject}
                className="text-xs cursor-pointer"
              >
                <FolderOpenIcon className="size-3.5 mr-2" />
                <span>打开本地项目目录</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void onOpenBundle?.();
                }}
                disabled={!onOpenBundle}
                className="text-xs cursor-pointer"
                title={
                  onOpenBundle ? "打开打包分发文件" : "核心尚未接线 openBundle"
                }
              >
                <PackageOpenIcon className="size-3.5 mr-2" />
                <span>打开 .ombrique 安装包</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="mx-1 h-4" />

          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="撤销"
                  title="撤销"
                  disabled={busy || !canUndo}
                  onClick={onUndo}
                  className="size-7"
                >
                  <Undo2Icon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>撤销</span>
                <Kbd>Ctrl+Z</Kbd>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="重做"
                  title="重做"
                  disabled={busy || !canRedo}
                  onClick={onRedo}
                  className="size-7"
                >
                  <Redo2Icon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>重做</span>
                <Kbd>Ctrl+Shift+Z</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="mx-1 h-4" />

          <div className="flex items-center gap-0.5">
            {INSERT_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Tooltip key={tool.kind}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-label={`插入${tool.label}`}
                      title={`插入${tool.label}`}
                      disabled={busy}
                      onClick={() => {
                        if (tool.kind === "image") {
                          if (onInsertImage) {
                            void onInsertImage();
                            return;
                          }
                          onCreateNode("image");
                          return;
                        }
                        onCreateNode(tool.kind);
                      }}
                      className="h-7 gap-1 px-2 text-xs font-normal"
                    >
                      <Icon data-icon="inline-start" />
                      <span>{tool.label}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    插入 {tool.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <Separator orientation="vertical" className="mx-1 h-4" />

          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="编组"
                  title="编组"
                  disabled={busy || !canGroup}
                  onClick={onGroupSelection}
                  className="size-7"
                >
                  <GroupIcon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canGroup ? (
                  <>
                    <span>编组所选图层</span>
                    <Kbd>Ctrl+G</Kbd>
                  </>
                ) : (
                  "未选中可编辑图层"
                )}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="解组"
                  title="解组"
                  disabled={busy || !canUngroup}
                  onClick={onUngroupSelection}
                  className="size-7"
                >
                  <UngroupIcon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canUngroup ? (
                  <>
                    <span>解除编组</span>
                    <Kbd>Ctrl+Shift+G</Kbd>
                  </>
                ) : (
                  "仅 Group 容器可解组"
                )}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="拼合矢量"
                  title="拼合矢量"
                  disabled={busy || !canFlatten}
                  onClick={onFlattenSelection}
                  className="size-7"
                >
                  <CombineIcon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canFlatten
                  ? "拼合布尔运算为独立矢量图层"
                  : "仅布尔运算图层可拼合为矢量"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {busy && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon
                className="animate-spin text-primary"
                data-icon="inline-start"
              />
              <span>处理中...</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Dialog
              open={componentDialogOpen}
              onOpenChange={setComponentDialogOpen}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label="创建组件"
                    title="创建组件"
                    disabled={busy || !canCreateComponent}
                    onClick={() => {
                      if (canCreateComponent) {
                        setComponentName(createComponentNameDefault);
                        setComponentDialogOpen(true);
                      }
                    }}
                    className="h-7 gap-1 px-2 text-xs font-normal"
                  >
                    <ComponentIcon
                      data-icon="inline-start"
                      className="size-3.5"
                    />
                    <span>创建组件</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {canCreateComponent
                    ? "将所选图层创建为独立组件"
                    : (createDisabledReason ?? "仅非根级可编辑图层可创建组件")}
                </TooltipContent>
              </Tooltip>

              <DialogContent position="left-panel">
                <DialogHeader>
                  <DialogTitle>创建组件</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = componentName.trim();
                    if (!trimmed) return;
                    onCreateComponent?.(trimmed);
                    setComponentDialogOpen(false);
                  }}
                  className="flex flex-col gap-3 py-2"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="component-name-input" className="text-xs">
                      组件名称
                    </Label>
                    <Input
                      id="component-name-input"
                      value={componentName}
                      onChange={(e) => setComponentName(e.target.value)}
                      placeholder="MyComponent"
                      className="h-8 font-mono text-xs"
                      autoFocus
                    />
                  </div>
                  <DialogFooter className="mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setComponentDialogOpen(false)}
                    >
                      取消
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!componentName.trim()}
                    >
                      创建
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Separator orientation="vertical" className="mx-1 h-4" />

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-label="缩放比例"
                      title="缩放比例"
                      disabled={busy}
                      className="h-7 gap-0.5 px-1.5 text-xs font-mono font-normal tabular-nums"
                    >
                      <span>{Math.round(zoom * 100)}%</span>
                      <ChevronDownIcon className="size-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">缩放与视图</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-40">
                {[0.25, 0.5, 0.75, 1, 1.5, 2].map((factor) => {
                  const active = Math.abs(zoom - factor) < 0.005;
                  return (
                    <DropdownMenuItem
                      key={factor}
                      onClick={() => onZoomTo?.(factor)}
                      disabled={!onZoomTo}
                      className="justify-between text-xs font-mono cursor-pointer"
                    >
                      <span>{factor * 100}%</span>
                      {active && (
                        <CheckIcon className="size-3 text-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onZoomToFit}
                  className="text-xs cursor-pointer gap-1.5"
                >
                  <Maximize2Icon className="size-3.5" />
                  <span>适应画布</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="适应画布"
                  title="适应画布"
                  disabled={busy}
                  onClick={onZoomToFit}
                  className="size-7"
                >
                  <Maximize2Icon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">自适应居中画布</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label="导出"
                  title="导出"
                  disabled={busy}
                  className="h-7 gap-1 px-2 text-xs font-normal"
                >
                  <DownloadIcon data-icon="inline-start" />
                  <span>导出</span>
                  <ChevronDownIcon className="size-3 opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={onExport}
                  className="text-xs cursor-pointer"
                >
                  <DownloadIcon className="size-3.5 mr-2" />
                  <span>导出当前画板 PNG</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void onBundleProject?.();
                  }}
                  disabled={!onBundleProject}
                  className="text-xs cursor-pointer"
                  title={
                    onBundleProject
                      ? "生成单个离线分发包"
                      : "核心尚未接线 bundleProject"
                  }
                >
                  <ArchiveIcon className="size-3.5 mr-2" />
                  <div className="flex flex-col gap-0.5">
                    <span>打包项目为 .ombrique</span>
                    <span className="text-[10px] text-muted-foreground">
                      生成单个离线分发包
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="mx-1 h-4" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={showHotspots ? "secondary" : "ghost"}
                  size="icon-xs"
                  aria-label="显示热区"
                  title="显示热区"
                  disabled={busy}
                  onClick={onToggleHotspots}
                  className="size-7"
                >
                  <ZapIcon
                    data-icon="inline-start"
                    className={
                      showHotspots ? "text-primary fill-primary/30" : ""
                    }
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>{showHotspots ? "隐藏交互热区" : "显示交互热区"}</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={prototypeMode ? "default" : "ghost"}
                  size="xs"
                  aria-label={prototypeMode ? "退出预览" : "原型预览"}
                  title={prototypeMode ? "退出预览" : "原型预览"}
                  disabled={busy}
                  onClick={onTogglePrototypeMode}
                  className="h-7 gap-1 px-2 text-xs font-normal"
                >
                  <PlayIcon
                    data-icon="inline-start"
                    className={prototypeMode ? "fill-current" : ""}
                  />
                  <span>{prototypeMode ? "退出" : "预览"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>
                  {prototypeMode ? "退出原型预览 (Esc)" : "运行原型预览 (Play)"}
                </span>
              </TooltipContent>
            </Tooltip>
          </div>

          {stats !== null && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <div
                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground"
                title="画布统计"
              >
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-medium"
                >
                  {stats.fps} FPS
                </Badge>
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] font-medium"
                >
                  可见 {stats.visible}
                </Badge>
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
