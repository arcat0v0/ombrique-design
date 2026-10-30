import {
  HandIcon,
  MousePointer2Icon,
  FrameIcon,
  SquareIcon,
  CircleIcon,
  StarIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CanvasTool } from "./types";

export interface FloatingToolSwitcherProps {
  activeTool: CanvasTool;
  onSelectTool: (tool: CanvasTool) => void;
}

const tools: Array<{
  value: CanvasTool;
  label: string;
  shortcut: string;
  icon: LucideIcon;
}> = [
  {
    value: "select",
    label: "选择工具",
    shortcut: "V",
    icon: MousePointer2Icon,
  },
  { value: "hand", label: "抓手工具", shortcut: "H", icon: HandIcon },
  { value: "frame", label: "Frame", shortcut: "F", icon: FrameIcon },
  { value: "rect", label: "矩形", shortcut: "R", icon: SquareIcon },
  { value: "ellipse", label: "椭圆", shortcut: "O", icon: CircleIcon },
  { value: "star", label: "星形", shortcut: "S", icon: StarIcon },
  { value: "text", label: "文字", shortcut: "T", icon: TypeIcon },
];

const VALID_TOOLS = new Set<string>(tools.map((t) => t.value));

const groupStyle = {
  position: "absolute",
  bottom: 16,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: 4,
  border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
  borderRadius: 9999,
  background: "var(--popover, #292929)",
  color: "var(--popover-foreground, #f5f5f5)",
  boxShadow: "0 8px 28px rgba(0, 0, 0, 0.35)",
} as const;

const toolStyle = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 9999,
  cursor: "pointer",
  border: "none",
  background: "transparent",
  color: "inherit",
} as const;

const activeToolStyle = {
  ...toolStyle,
  background: "var(--primary, #f5f5f5)",
  color: "var(--primary-foreground, #141414)",
} as const;

const iconStyle = { width: 16, height: 16 } as const;

const tooltipStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
} as const;

const kbdStyle = {
  fontSize: 10,
  opacity: 0.6,
} as const;

export function FloatingToolSwitcher({
  activeTool,
  onSelectTool,
}: FloatingToolSwitcherProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <ToggleGroup
        type="single"
        value={activeTool}
        onValueChange={(value) => {
          if (VALID_TOOLS.has(value)) onSelectTool(value as CanvasTool);
        }}
        aria-label="画布工具"
        style={groupStyle}
      >
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Tooltip key={tool.value}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={tool.value}
                  aria-label={tool.label}
                  style={
                    activeTool === tool.value ? activeToolStyle : toolStyle
                  }
                >
                  <Icon style={iconStyle} />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span style={tooltipStyle}>
                  {tool.label}
                  <Kbd style={kbdStyle}>{tool.shortcut}</Kbd>
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    </TooltipProvider>
  );
}
