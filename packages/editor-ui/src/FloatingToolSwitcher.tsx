import { HandIcon, MousePointer2Icon, type LucideIcon } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FloatingToolSwitcherProps {
  activeTool: "select" | "hand";
  onSelectTool: (tool: "select" | "hand") => void;
}

const tools: Array<{
  value: "select" | "hand";
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
];

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
  minWidth: 32,
  padding: 0,
  border: 0,
  borderRadius: 9999,
  background: "transparent",
  color: "var(--foreground, #f5f5f5)",
  cursor: "pointer",
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
  gap: 8,
  padding: "6px 8px",
  borderRadius: 6,
  background: "var(--popover, #292929)",
  color: "var(--popover-foreground, #f5f5f5)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
  fontSize: 12,
  zIndex: 30,
} as const;

const kbdStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 4px",
  borderRadius: 4,
  background: "rgba(255, 255, 255, 0.12)",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: 11,
  lineHeight: 1,
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
          if (value === "select" || value === "hand") onSelectTool(value);
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
              <TooltipContent side="top" sideOffset={8} style={tooltipStyle}>
                <span>{tool.label}</span>
                <Kbd style={kbdStyle}>{tool.shortcut}</Kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    </TooltipProvider>
  );
}
