import { Trash2Icon } from "lucide-react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type StrokeShadowAlignment,
  getStrokeShadowAlignment,
  parseShadow,
  removeStrokeShadows,
  splitCssList,
  upsertStrokeShadow,
} from "./effectStyles";
import type { SelectionSummary } from "./types";

export interface StrokeSectionProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

interface StrokeState {
  hasStroke: boolean;
  color: string;
  width: string;
  alignment: StrokeShadowAlignment | "center";
}

function extractStrokeState(selection: SelectionSummary): StrokeState {
  const styles: Record<string, string> = {};
  for (const row of selection.styles) styles[row.key] = String(row.value);
  for (const attr of selection.attrs) styles[attr.key] = String(attr.value);

  const boxShadow = styles.boxShadow;
  const shadowAlign = getStrokeShadowAlignment(boxShadow);

  if (shadowAlign) {
    let shadowColor = "#000000";
    let shadowWidth = "1";
    for (const token of splitCssList(boxShadow)) {
      const parsed = parseShadow(token);
      if (parsed) {
        shadowColor = parsed.color;
        shadowWidth = parsed.spread.replace(/px$/i, "");
        break;
      }
    }
    return {
      hasStroke: true,
      color: shadowColor,
      width: shadowWidth || "1",
      alignment: shadowAlign,
    };
  }

  const strokeAttr = styles.stroke;
  const strokeWidthAttr = styles.strokeWidth;
  const border = styles.border;
  const borderWidth = styles.borderWidth;
  const borderColor = styles.borderColor;

  if (strokeAttr) {
    return {
      hasStroke: true,
      color: strokeAttr,
      width: strokeWidthAttr
        ? String(strokeWidthAttr).replace(/px$/i, "")
        : "1",
      alignment: "center",
    };
  }

  if (border) {
    const parts = border.split(/\s+/);
    const width = parts[0]?.replace(/px$/i, "") ?? "1";
    const color =
      parts.length >= 3
        ? parts.slice(2).join(" ")
        : (parts[parts.length - 1] ?? "#000000");
    return {
      hasStroke: true,
      color,
      width,
      alignment: "center",
    };
  }

  if (borderWidth || borderColor) {
    return {
      hasStroke: true,
      color: borderColor ?? "#000000",
      width: borderWidth ? borderWidth.replace(/px$/i, "") : "1",
      alignment: "center",
    };
  }

  return {
    hasStroke: false,
    color: "#000000",
    width: "1",
    alignment: "center",
  };
}

export function StrokeSection({
  selection,
  disabled,
  onSetStyle,
}: StrokeSectionProps) {
  const state = extractStrokeState(selection);
  const [colorVal, setColorVal] = useState<string>(state.color);
  const [widthVal, setWidthVal] = useState<string>(state.width);

  useEffect(() => {
    setColorVal(state.color);
    setWidthVal(state.width);
  }, [state.color, state.width]);

  const existingBoxShadow = selection.styles.find(
    (s) => s.key === "boxShadow",
  )?.value;

  const isShapeTag = [
    "rect",
    "ellipse",
    "star",
    "vector",
    "boolean",
    "path",
  ].includes(selection.tag.toLowerCase());

  const applyStroke = (
    color: string,
    widthStr: string,
    alignment: StrokeShadowAlignment | "center",
  ) => {
    const widthNum = Number.parseFloat(widthStr) || 1;
    const finalWidth = `${widthNum}px`;

    if (alignment === "inside" || alignment === "outside") {
      const nextBoxShadow = upsertStrokeShadow(
        existingBoxShadow,
        alignment,
        finalWidth,
        color,
      );
      onSetStyle("boxShadow", nextBoxShadow);

      if (isShapeTag) {
        onSetStyle("stroke", null);
        onSetStyle("strokeWidth", null);
      }
      onSetStyle("border", null);
      onSetStyle("borderWidth", null);
    } else {
      const nextBoxShadow = removeStrokeShadows(existingBoxShadow);
      onSetStyle("boxShadow", nextBoxShadow);

      if (isShapeTag) {
        onSetStyle("stroke", color);
        onSetStyle("strokeWidth", widthNum);
        onSetStyle("border", null);
      } else {
        onSetStyle("border", `${widthNum}px solid ${color}`);
      }
    }
  };

  const handleAlignmentChange = (newAlign: string) => {
    if (
      newAlign !== "inside" &&
      newAlign !== "center" &&
      newAlign !== "outside"
    )
      return;
    applyStroke(colorVal, widthVal, newAlign);
  };

  const commitColor = () => {
    const trimmed = colorVal.trim();
    if (!trimmed || trimmed === state.color) return;
    applyStroke(trimmed, widthVal, state.alignment);
  };

  const commitWidth = () => {
    const trimmed = widthVal.trim();
    if (!trimmed || trimmed === state.width) return;
    applyStroke(colorVal, trimmed, state.alignment);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    onCommit: () => void,
    onReset: () => void,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
      (e.target as HTMLElement).blur();
    } else if (e.key === "Escape") {
      onReset();
      (e.target as HTMLElement).blur();
    }
  };

  const removeStroke = () => {
    const nextBoxShadow = removeStrokeShadows(existingBoxShadow);
    onSetStyle("boxShadow", nextBoxShadow);
    onSetStyle("stroke", null);
    onSetStyle("strokeWidth", null);
    onSetStyle("border", null);
    onSetStyle("borderWidth", null);
    onSetStyle("borderColor", null);
  };

  const addStroke = () => {
    applyStroke("#000000", "1", "center");
  };

  if (!state.hasStroke) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-[10px] font-medium text-muted-foreground/80">
          Stroke 描边
        </span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-5 text-[10px] px-2"
          disabled={disabled}
          onClick={addStroke}
        >
          + Stroke
        </Button>
      </div>
    );
  }

  return (
    <div
      className="stroke-section flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs"
      data-testid="stroke-section"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">
          Stroke 描边
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground hover:text-destructive"
          disabled={disabled}
          onClick={removeStroke}
          title="删除描边"
          aria-label="删除描边"
        >
          <Trash2Icon className="size-3" />
        </Button>
      </div>

      <FieldGroup className="gap-2">
        <Field orientation="horizontal" className="items-center">
          <FieldLabel className="text-[10px] text-muted-foreground w-12">
            颜色
          </FieldLabel>
          <div className="flex items-center gap-1.5 flex-1">
            <input
              type="color"
              value={
                colorVal.startsWith("#") && colorVal.length === 7
                  ? colorVal
                  : "#000000"
              }
              disabled={disabled}
              onChange={(e) => {
                setColorVal(e.target.value);
                applyStroke(e.target.value, widthVal, state.alignment);
              }}
              className="size-6 rounded border border-border cursor-pointer bg-transparent"
              aria-label="描边颜色"
            />
            <Input
              type="text"
              value={colorVal}
              disabled={disabled}
              onChange={(e) => setColorVal(e.target.value)}
              onBlur={commitColor}
              onKeyDown={(e) =>
                handleKeyDown(e, commitColor, () => setColorVal(state.color))
              }
              className="h-6 flex-1 px-1.5 text-[11px] font-mono"
              placeholder="#000000"
              aria-label="描边颜色代码"
            />
          </div>
        </Field>

        <Field orientation="horizontal" className="items-center">
          <FieldLabel className="text-[10px] text-muted-foreground w-12">
            粗细 (px)
          </FieldLabel>
          <Input
            type="number"
            min={0}
            step={1}
            value={widthVal}
            disabled={disabled}
            onChange={(e) => setWidthVal(e.target.value)}
            onBlur={commitWidth}
            onKeyDown={(e) =>
              handleKeyDown(e, commitWidth, () => setWidthVal(state.width))
            }
            className="h-6 flex-1 px-1.5 text-[11px] font-mono"
            aria-label="描边粗细"
          />
        </Field>

        <Field orientation="horizontal" className="items-center">
          <FieldLabel className="text-[10px] text-muted-foreground w-12">
            对齐方式
          </FieldLabel>
          <ToggleGroup
            type="single"
            value={state.alignment}
            onValueChange={handleAlignmentChange}
            disabled={disabled}
            size="sm"
            className="h-6 flex-1 justify-between"
          >
            <ToggleGroupItem
              value="inside"
              className="h-6 flex-1 text-[10px] px-1"
              aria-label="内侧描边 (Inside)"
            >
              Inside
            </ToggleGroupItem>
            <ToggleGroupItem
              value="center"
              className="h-6 flex-1 text-[10px] px-1"
              aria-label="居中描边 (Center)"
            >
              Center
            </ToggleGroupItem>
            <ToggleGroupItem
              value="outside"
              className="h-6 flex-1 text-[10px] px-1"
              aria-label="外侧描边 (Outside)"
            >
              Outside
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldGroup>
    </div>
  );
}
