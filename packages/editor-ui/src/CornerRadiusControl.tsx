import { Unlink2Icon, Link2Icon } from "lucide-react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseStyleInput } from "./parseStyleInput";
import type { SelectionSummary } from "./types";

export interface CornerRadiusControlProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

interface CornerValues {
  all: string;
  tl: string;
  tr: string;
  br: string;
  bl: string;
}

function extractCornerValues(selection: SelectionSummary): CornerValues {
  const map: Record<string, string> = {};
  for (const row of selection.styles) map[row.key] = String(row.value);
  for (const attr of selection.attrs) map[attr.key] = String(attr.value);

  const all = map.borderRadius ?? map.radius ?? "";
  const tl = map.borderTopLeftRadius ?? map.radiusTopLeft ?? "";
  const tr = map.borderTopRightRadius ?? map.radiusTopRight ?? "";
  const br = map.borderBottomRightRadius ?? map.radiusBottomRight ?? "";
  const bl = map.borderBottomLeftRadius ?? map.radiusBottomLeft ?? "";

  return { all, tl, tr, br, bl };
}

export function CornerRadiusControl({
  selection,
  disabled,
  onSetStyle,
}: CornerRadiusControlProps) {
  const initialValues = extractCornerValues(selection);
  const hasDistinctCorners = Boolean(
    initialValues.tl ||
      initialValues.tr ||
      initialValues.br ||
      initialValues.bl,
  );

  const [expanded, setExpanded] = useState<boolean>(hasDistinctCorners);
  const [allVal, setAllVal] = useState<string>(initialValues.all);
  const [tlVal, setTlVal] = useState<string>(initialValues.tl);
  const [trVal, setTrVal] = useState<string>(initialValues.tr);
  const [brVal, setBrVal] = useState<string>(initialValues.br);
  const [blVal, setBlVal] = useState<string>(initialValues.bl);

  useEffect(() => {
    const current = extractCornerValues(selection);
    setAllVal(current.all);
    setTlVal(current.tl);
    setTrVal(current.tr);
    setBrVal(current.br);
    setBlVal(current.bl);
    if (current.tl || current.tr || current.br || current.bl) {
      setExpanded(true);
    }
  }, [selection]);

  const usesRadiusProp =
    selection.attrs.some((a) => a.key === "radius") ||
    selection.styles.some((s) => s.key === "radius") ||
    ["rect", "frame"].includes(selection.tag.toLowerCase());

  const commitAll = () => {
    const trimmed = allVal.trim();
    if (trimmed === initialValues.all) return;
    const parsed = parseStyleInput("radius", trimmed);
    const key = usesRadiusProp ? "radius" : "borderRadius";
    onSetStyle(key, parsed);
  };

  const commitCorner = (
    corner: "tl" | "tr" | "br" | "bl",
    val: string,
    initialVal: string,
  ) => {
    const trimmed = val.trim();
    if (trimmed === initialVal) return;
    const parsed = parseStyleInput("radius", trimmed);

    const propKey =
      corner === "tl"
        ? "radiusTopLeft"
        : corner === "tr"
          ? "radiusTopRight"
          : corner === "br"
            ? "radiusBottomRight"
            : "radiusBottomLeft";

    const cssKey =
      corner === "tl"
        ? "borderTopLeftRadius"
        : corner === "tr"
          ? "borderTopRightRadius"
          : corner === "br"
            ? "borderBottomRightRadius"
            : "borderBottomLeftRadius";

    const key = usesRadiusProp ? propKey : cssKey;
    onSetStyle(key, parsed);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    onCommit: () => void,
    resetVal: () => void,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
      (e.target as HTMLElement).blur();
    } else if (e.key === "Escape") {
      resetVal();
      (e.target as HTMLElement).blur();
    }
  };

  return (
    <div
      className="corner-radius-control flex flex-col gap-1.5"
      data-testid="corner-radius-control"
    >
      <div className="flex items-center justify-between">
        <FieldLabel className="text-[10px] text-muted-foreground">
          圆角 (Corner Radius)
        </FieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "size-5 text-muted-foreground hover:text-foreground",
            expanded && "text-primary bg-primary/10",
          )}
          disabled={disabled}
          onClick={() => setExpanded(!expanded)}
          title={
            expanded ? "收起独立4角圆角" : "展开独立4角圆角 (Detach corners)"
          }
          aria-label={expanded ? "收起独立4角圆角" : "展开独立4角圆角"}
          aria-expanded={expanded}
        >
          {expanded ? (
            <Link2Icon className="size-3" />
          ) : (
            <Unlink2Icon className="size-3" />
          )}
        </Button>
      </div>

      {!expanded ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            className="h-6 flex-1 px-1.5 text-[11px] font-mono"
            aria-label="统一圆角"
            placeholder="0"
            value={allVal}
            disabled={disabled}
            onChange={(e) => setAllVal(e.target.value)}
            onBlur={commitAll}
            onKeyDown={(e) =>
              handleKeyDown(e, commitAll, () => setAllVal(initialValues.all))
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border/60 bg-muted/20 p-1.5">
          <div className="flex items-center gap-1">
            <span
              className="w-5 shrink-0 text-center font-mono text-[9px] text-muted-foreground"
              title="Top Left 左上角"
            >
              TL
            </span>
            <Input
              type="text"
              className="h-6 flex-1 px-1 text-[11px] font-mono"
              aria-label="左上圆角 (Top-Left)"
              placeholder="0"
              value={tlVal}
              disabled={disabled}
              onChange={(e) => setTlVal(e.target.value)}
              onBlur={() => commitCorner("tl", tlVal, initialValues.tl)}
              onKeyDown={(e) =>
                handleKeyDown(
                  e,
                  () => commitCorner("tl", tlVal, initialValues.tl),
                  () => setTlVal(initialValues.tl),
                )
              }
            />
          </div>

          <div className="flex items-center gap-1">
            <span
              className="w-5 shrink-0 text-center font-mono text-[9px] text-muted-foreground"
              title="Top Right 右上角"
            >
              TR
            </span>
            <Input
              type="text"
              className="h-6 flex-1 px-1 text-[11px] font-mono"
              aria-label="右上圆角 (Top-Right)"
              placeholder="0"
              value={trVal}
              disabled={disabled}
              onChange={(e) => setTrVal(e.target.value)}
              onBlur={() => commitCorner("tr", trVal, initialValues.tr)}
              onKeyDown={(e) =>
                handleKeyDown(
                  e,
                  () => commitCorner("tr", trVal, initialValues.tr),
                  () => setTrVal(initialValues.tr),
                )
              }
            />
          </div>

          <div className="flex items-center gap-1">
            <span
              className="w-5 shrink-0 text-center font-mono text-[9px] text-muted-foreground"
              title="Bottom Left 左下角"
            >
              BL
            </span>
            <Input
              type="text"
              className="h-6 flex-1 px-1 text-[11px] font-mono"
              aria-label="左下圆角 (Bottom-Left)"
              placeholder="0"
              value={blVal}
              disabled={disabled}
              onChange={(e) => setBlVal(e.target.value)}
              onBlur={() => commitCorner("bl", blVal, initialValues.bl)}
              onKeyDown={(e) =>
                handleKeyDown(
                  e,
                  () => commitCorner("bl", blVal, initialValues.bl),
                  () => setBlVal(initialValues.bl),
                )
              }
            />
          </div>

          <div className="flex items-center gap-1">
            <span
              className="w-5 shrink-0 text-center font-mono text-[9px] text-muted-foreground"
              title="Bottom Right 右下角"
            >
              BR
            </span>
            <Input
              type="text"
              className="h-6 flex-1 px-1 text-[11px] font-mono"
              aria-label="右下圆角 (Bottom-Right)"
              placeholder="0"
              value={brVal}
              disabled={disabled}
              onChange={(e) => setBrVal(e.target.value)}
              onBlur={() => commitCorner("br", brVal, initialValues.br)}
              onKeyDown={(e) =>
                handleKeyDown(
                  e,
                  () => commitCorner("br", brVal, initialValues.br),
                  () => setBrVal(initialValues.br),
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
