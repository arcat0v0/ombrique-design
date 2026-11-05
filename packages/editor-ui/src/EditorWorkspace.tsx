import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CoinsIcon,
  ComponentIcon,
  FileStackIcon,
  HistoryIcon,
  LayersIcon,
  MessageSquareIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DrawerTab =
  | "pages"
  | "layers"
  | "assets"
  | "tokens"
  | "history"
  | "transactions"
  | "comments";

export type EditorWorkspaceState = {
  drawerTab: DrawerTab | null;
  inspectorVisible: boolean;
};

type RailTab = Exclude<DrawerTab, "pages">;

interface RailItem {
  tab: RailTab;
  label: string;
  icon: LucideIcon;
}

const railItems: RailItem[] = [
  { tab: "layers", label: "图层", icon: LayersIcon },
  { tab: "assets", label: "资产", icon: ComponentIcon },
  { tab: "tokens", label: "设计变量", icon: CoinsIcon },
  { tab: "history", label: "版本历史", icon: HistoryIcon },
  { tab: "transactions", label: "编辑历史", icon: ClockIcon },
  { tab: "comments", label: "评论", icon: MessageSquareIcon },
];

const tabTitles: Record<DrawerTab, string> = {
  pages: "页面",
  layers: "图层",
  assets: "资产",
  tokens: "设计变量",
  history: "版本历史",
  transactions: "编辑历史",
  comments: "评论",
};

function getStoredState(): EditorWorkspaceState {
  if (typeof window === "undefined") {
    return { drawerTab: null, inspectorVisible: true };
  }
  try {
    const stored = window.localStorage.getItem("ombrique-editor-workspace");
    if (!stored) return { drawerTab: null, inspectorVisible: true };
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) {
      return { drawerTab: null, inspectorVisible: true };
    }
    const record = parsed as Record<string, unknown>;
    return {
      drawerTab: null,
      inspectorVisible: record.inspectorVisible !== false,
    };
  } catch {
    return { drawerTab: null, inspectorVisible: true };
  }
}

function RailButton({
  label,
  icon: Icon,
  selected,
  expanded,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={label}
          aria-pressed={selected && expanded}
          onClick={onClick}
          className={cn(
            "editor-rail-button size-9 rounded-lg p-0 text-[#949494] hover:bg-[#1b1b1b] hover:text-white",
            selected && expanded && "bg-[#242424] text-white",
          )}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function EditorRail({
  drawerTab,
  onChange,
}: {
  drawerTab: DrawerTab | null;
  onChange: (tab: DrawerTab | null) => void;
}) {
  return (
    <nav
      aria-label="编辑器面板"
      className="editor-rail z-30 flex h-full w-12 flex-none flex-col items-center gap-1 bg-[#0a0a0a] py-2"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={drawerTab ? "收起面板" : "展开面板"}
            aria-expanded={drawerTab !== null}
            onClick={() => onChange(drawerTab ? null : "layers")}
            className="editor-rail-button size-9 rounded-lg p-0 text-[#b4b4b4] hover:bg-[#1b1b1b] hover:text-white"
          >
            {drawerTab ? (
              <ChevronLeftIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {drawerTab ? "收起面板" : "展开面板"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label="页面"
            aria-pressed={drawerTab === "pages"}
            onClick={() => onChange(drawerTab === "pages" ? null : "pages")}
            className={cn(
              "editor-rail-button size-9 rounded-lg p-0 text-[#949494] hover:bg-[#1b1b1b] hover:text-white",
              drawerTab === "pages" && "bg-[#242424] text-white",
            )}
          >
            <FileStackIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">页面</TooltipContent>
      </Tooltip>
      <div className="my-1 h-px w-5 bg-[#242424]" />
      {railItems.map((item) => (
        <RailButton
          key={item.tab}
          label={item.label}
          icon={item.icon}
          selected={drawerTab === item.tab}
          expanded={drawerTab !== null}
          onClick={() => onChange(drawerTab === item.tab ? null : item.tab)}
        />
      ))}
    </nav>
  );
}

export function LeftDrawer({
  tab,
  title,
  children,
  onClose,
}: {
  tab: Exclude<DrawerTab, "pages">;
  title?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label={`${tabTitles[tab]}面板`}
      data-ui
      className="editor-drawer absolute top-0 bottom-0 left-0 z-20 flex w-60 flex-col overflow-hidden border-r border-[#1f1f1f] bg-[#111111]"
    >
      <div
        className="flex h-10 flex-none items-center justify-between border-b border-[#1f1f1f] px-3"
        data-ui
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-white">
          <span className="truncate">{title ?? tabTitles[tab]}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="收起左侧面板"
          onClick={onClose}
          className="size-7 rounded-md text-[#949494] hover:bg-[#222222] hover:text-white"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}

export function PagesDrawer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="页面面板"
      data-ui
      className="editor-drawer absolute top-0 bottom-0 left-0 z-20 flex w-60 flex-col overflow-hidden border-r border-[#1f1f1f] bg-[#111111]"
    >
      <div
        className="flex h-10 flex-none items-center justify-between border-b border-[#1f1f1f] px-3"
        data-ui
      >
        <span className="text-sm font-medium text-white">页面</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="收起左侧面板"
          onClick={onClose}
          className="size-7 rounded-md text-[#949494] hover:bg-[#222222] hover:text-white"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}

export function InspectorDrawer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <aside
      data-ui
      aria-label="属性面板"
      className="editor-inspector absolute top-0 right-0 bottom-0 z-20 flex w-[280px] flex-col overflow-hidden border-l border-[#1f1f1f] bg-[#111111]"
    >
      <div
        className="flex h-10 flex-none items-center justify-between border-b border-[#1f1f1f] px-3"
        data-ui
      >
        <span className="text-sm font-medium text-white">属性</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="隐藏属性面板"
          onClick={onClose}
          className="size-7 rounded-md text-[#949494] hover:bg-[#222222] hover:text-white"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}

export function useEditorWorkspace(
  commentsTabRequest?: number,
  renameRequest?: number,
  selectionId?: string,
  activeTool?: string,
) {
  const [state, setState] = useState<EditorWorkspaceState>(getStoredState);
  const previousSelectionId = useRef(selectionId);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "ombrique-editor-workspace",
        JSON.stringify({ inspectorVisible: state.inspectorVisible }),
      );
    } catch {}
  }, [state.inspectorVisible]);

  useEffect(() => {
    if (commentsTabRequest) {
      setState((current) => ({ ...current, drawerTab: "comments" }));
    }
  }, [commentsTabRequest]);

  useEffect(() => {
    if (activeTool === "comment") {
      setState((current) => ({ ...current, drawerTab: "comments" }));
    }
  }, [activeTool]);

  useEffect(() => {
    if (renameRequest && selectionId) {
      setState((current) => ({ ...current, drawerTab: "layers" }));
    }
  }, [renameRequest, selectionId]);

  useEffect(() => {
    if (previousSelectionId.current !== selectionId) {
      previousSelectionId.current = selectionId;
      setState((current) => ({ ...current, inspectorVisible: true }));
    }
  }, [selectionId]);

  const setDrawerTab = (tab: DrawerTab | null) =>
    setState((current) => ({ ...current, drawerTab: tab }));

  const hideInspector = () =>
    setState((current) => ({ ...current, inspectorVisible: false }));

  const showInspector = () =>
    setState((current) => ({ ...current, inspectorVisible: true }));

  return { state, setDrawerTab, hideInspector, showInspector };
}
