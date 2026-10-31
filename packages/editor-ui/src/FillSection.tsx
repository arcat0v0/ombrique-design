import {
  ChevronDownIcon,
  DropletIcon,
  PaletteIcon,
  PipetteIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GradientEditor } from "./GradientEditor";
import { defaultGradient, isGradient, parseGradient } from "./gradientStyles";
import type { SelectionSummary } from "./types";

export interface FillSectionProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

type FillType = "solid" | "linear" | "radial";

function getFill(selection: SelectionSummary): {
  type: FillType;
  value: string;
} {
  const styleRows = Object.fromEntries(
    selection.styles.map((s) => [s.key, s.value]),
  );
  const fillValue = styleRows.fill ?? styleRows.background ?? "";
  const isGrad = isGradient(fillValue);
  return {
    type: isGrad
      ? parseGradient(fillValue)?.type === "radial"
        ? "radial"
        : "linear"
      : "solid",
    value: fillValue || "#d9d9d9",
  };
}

export function FillSection({
  selection,
  disabled,
  onSetStyle,
}: FillSectionProps) {
  const fill = getFill(selection);
  const [colorVal, setColorVal] = useState<string>(
    fill.type === "solid" ? fill.value : "#d9d9d9",
  );
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    if (fill.type === "solid") {
      setColorVal(fill.value);
    }
  }, [fill.type, fill.value]);

  const setType = (type: FillType) => {
    if (type === "solid") {
      onSetStyle("fill", colorVal || "#d9d9d9");
      if (isGradient(fill.value)) onSetStyle("background", null);
    } else {
      const gradient = defaultGradient(colorVal, type);
      const css =
        type === "linear"
          ? `linear-gradient(${gradient.angle}deg, ${gradient.stops.map((s) => `${s.color} ${s.position}%`).join(", ")})`
          : `radial-gradient(circle, ${gradient.stops.map((s) => `${s.color} ${s.position}%`).join(", ")})`;
      onSetStyle("background", css);
      onSetStyle("fill", null);
      setDialogOpen(true);
    }
  };

  const commitColor = () => {
    const trimmed = colorVal.trim();
    if (!trimmed) return;
    onSetStyle("fill", trimmed);
  };

  return (
    <div
      className="fill-section flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs"
      data-testid="fill-section"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">
          Fill 填充
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground hover:text-foreground"
              disabled={disabled}
              aria-label="更改填充类型"
            >
              <PipetteIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[10px]">
                Fill 类型
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs flex items-center gap-1.5"
                onSelect={() => setType("solid")}
              >
                <PaletteIcon className="size-3" />
                纯色 Solid
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs flex items-center gap-1.5"
                onSelect={() => setType("linear")}
              >
                <DropletIcon className="size-3" />
                线性渐变 Linear
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs flex items-center gap-1.5"
                onSelect={() => setType("radial")}
              >
                <ChevronDownIcon className="size-3 rotate-180" />
                径向渐变 Radial
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Field orientation="horizontal" className="items-center gap-1.5">
        <FieldLabel className="text-[10px] text-muted-foreground w-10 shrink-0">
          颜色
        </FieldLabel>

        {fill.type === "solid" ? (
          <>
            <input
              type="color"
              value={
                colorVal.startsWith("#") && colorVal.length === 7
                  ? colorVal
                  : "#d9d9d9"
              }
              disabled={disabled}
              onChange={(e) => {
                setColorVal(e.target.value);
                onSetStyle("fill", e.target.value);
              }}
              className="size-6 rounded border border-border cursor-pointer bg-transparent shrink-0"
              aria-label="填充颜色"
            />
            <Input
              type="text"
              value={colorVal}
              disabled={disabled}
              onChange={(e) => setColorVal(e.target.value)}
              onBlur={commitColor}
              className="h-6 flex-1 px-1.5 text-[11px] font-mono"
              placeholder="#d9d9d9"
              aria-label="填充颜色代码"
            />
          </>
        ) : (
          <>
            <div
              className={cn(
                "size-6 rounded border border-border/60 shrink-0 shadow-inner",
                fill.type === "linear" &&
                  "bg-gradient-to-r from-blue-500 to-cyan-400",
              )}
              style={{
                background:
                  fill.type === "radial"
                    ? "radial-gradient(circle, var(--primary) 0%, transparent 100%)"
                    : undefined,
              }}
              aria-hidden="true"
            />
            <div className="flex-1 flex items-center gap-1">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-6 flex-1 text-[10px] font-normal"
                    disabled={disabled}
                  >
                    编辑渐变 (Edit Gradient)
                  </Button>
                </DialogTrigger>
                <DialogContent position="right-panel">
                  <DialogHeader>
                    <DialogTitle className="text-xs">
                      渐变编辑 Gradient Editor
                    </DialogTitle>
                  </DialogHeader>
                  <GradientEditor
                    value={fill.value}
                    disabled={disabled}
                    onChange={(val) => onSetStyle("background", val)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </Field>
    </div>
  );
}
