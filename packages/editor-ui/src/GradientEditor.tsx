import { ArrowLeftRightIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  type GradientData,
  type GradientStop,
  type GradientType,
  defaultGradient,
  isGradient,
  parseGradient,
  serializeGradient,
} from "./gradientStyles";

export interface GradientEditorProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function GradientEditor({
  value,
  disabled = false,
  onChange,
}: GradientEditorProps) {
  const [data, setData] = useState<GradientData>(() => {
    return parseGradient(value) ?? defaultGradient(value || "#3b82f6");
  });
  const [activeStopId, setActiveStopId] = useState<string>(
    () => data.stops[0]?.id ?? "",
  );
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGradient(value)) {
      const parsed = parseGradient(value);
      if (parsed) {
        setData(parsed);
        if (!parsed.stops.some((s) => s.id === activeStopId)) {
          setActiveStopId(parsed.stops[0]?.id ?? "");
        }
      }
    }
  }, [value, activeStopId]);

  const activeStop =
    data.stops.find((s) => s.id === activeStopId) ?? data.stops[0];

  const updateGradient = (next: GradientData) => {
    setData(next);
    onChange(serializeGradient(next));
  };

  const setType = (type: GradientType) => {
    if (type === data.type) return;
    updateGradient({ ...data, type });
  };

  const setAngle = (angle: number) => {
    const normalized = ((angle % 360) + 360) % 360;
    updateGradient({ ...data, angle: Math.round(normalized) });
  };

  const updateActiveStop = (patch: Partial<GradientStop>) => {
    if (!activeStop) return;
    const nextStops = data.stops.map((s) =>
      s.id === activeStop.id ? { ...s, ...patch } : s,
    );
    updateGradient({ ...data, stops: nextStops });
  };

  const handleBarClick = (e: MouseEvent<HTMLElement>) => {
    if (disabled || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    const pos = Math.round(ratio * 100);

    const newStop: GradientStop = {
      id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      color: activeStop?.color ?? "#ffffff",
      position: pos,
    };

    const nextStops = [...data.stops, newStop].sort(
      (a, b) => a.position - b.position,
    );
    setActiveStopId(newStop.id);
    updateGradient({ ...data, stops: nextStops });
  };

  const handleStopPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    stopId: string,
  ) => {
    if (disabled) return;
    e.stopPropagation();
    setActiveStopId(stopId);

    const barEl = barRef.current;
    if (!barEl) return;

    const onPointerMove = (moveEv: PointerEvent) => {
      const rect = barEl.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (moveEv.clientX - rect.left) / rect.width),
      );
      const pos = Math.round(ratio * 100);

      setData((prev) => {
        const nextStops = prev.stops.map((s) =>
          s.id === stopId ? { ...s, position: pos } : s,
        );
        const nextData = { ...prev, stops: nextStops };
        onChange(serializeGradient(nextData));
        return nextData;
      });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const deleteActiveStop = () => {
    if (data.stops.length <= 2 || !activeStop) return;
    const nextStops = data.stops.filter((s) => s.id !== activeStop.id);
    setActiveStopId(nextStops[0]?.id ?? "");
    updateGradient({ ...data, stops: nextStops });
  };

  const reverseStops = () => {
    const nextStops = data.stops.map((s) => ({
      ...s,
      position: 100 - s.position,
    }));
    updateGradient({ ...data, stops: nextStops });
  };

  const previewGradient = serializeGradient({
    ...data,
    type: "linear",
    angle: 90,
  });

  return (
    <div
      className="gradient-editor flex flex-col gap-3 rounded-lg border border-border bg-card/80 p-3 text-xs"
      data-testid="gradient-editor"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          渐变填充 Gradient
        </span>
        <ToggleGroup
          type="single"
          value={data.type}
          onValueChange={(val) => {
            if (val === "linear" || val === "radial") setType(val);
          }}
          disabled={disabled}
          size="sm"
          className="h-6"
        >
          <ToggleGroupItem
            value="linear"
            aria-label="线性渐变"
            className="h-6 px-2 text-[10px]"
          >
            Linear
          </ToggleGroupItem>
          <ToggleGroupItem
            value="radial"
            aria-label="径向渐变"
            className="h-6 px-2 text-[10px]"
          >
            Radial
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          ref={barRef}
          className="relative h-7 w-full rounded-md border border-border/80 shadow-inner select-none"
          style={{ background: previewGradient }}
        >
          <button
            type="button"
            onClick={handleBarClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleBarClick({
                  clientX:
                    (barRef.current?.getBoundingClientRect().left ?? 0) +
                    (barRef.current?.getBoundingClientRect().width ?? 0) / 2,
                } as MouseEvent<HTMLDivElement>);
              }
            }}
            disabled={disabled}
            className="absolute inset-0 h-full w-full cursor-crosshair rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50"
            title="点击色带添加色标"
            aria-label="渐变条，点击添加色标"
          />
          {data.stops.map((stop) => {
            const isSelected = stop.id === activeStop?.id;
            return (
              <button
                key={stop.id}
                type="button"
                onPointerDown={(e) => handleStopPointerDown(e, stop.id)}
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-4 rounded-full border-2 border-white shadow-md transition-transform cursor-grab active:cursor-grabbing focus:outline-none",
                  isSelected
                    ? "scale-125 ring-2 ring-primary ring-offset-1 z-10"
                    : "hover:scale-110",
                )}
                style={{
                  left: `${stop.position}%`,
                  backgroundColor: stop.color,
                }}
                aria-label={`色标 ${stop.position}%`}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>点击色带添加色标，拖拽移动</span>
          <span>100%</span>
        </div>
      </div>

      {activeStop && (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-foreground">
              选中色标属性
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6"
                disabled={disabled}
                onClick={reverseStops}
                title="反转所有色标"
                aria-label="反转色标"
              >
                <ArrowLeftRightIcon className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6 text-destructive hover:text-destructive"
                disabled={disabled || data.stops.length <= 2}
                onClick={deleteActiveStop}
                title="删除当前色标 (最少保留2个)"
                aria-label="删除色标"
              >
                <Trash2Icon className="size-3" />
              </Button>
            </div>
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
                    activeStop.color.startsWith("#") &&
                    activeStop.color.length === 7
                      ? activeStop.color
                      : "#3b82f6"
                  }
                  disabled={disabled}
                  onChange={(e) => updateActiveStop({ color: e.target.value })}
                  className="size-6 rounded border border-border cursor-pointer bg-transparent"
                  aria-label="选择色标颜色"
                />
                <Input
                  type="text"
                  value={activeStop.color}
                  disabled={disabled}
                  onChange={(e) => updateActiveStop({ color: e.target.value })}
                  className="h-6 flex-1 px-1.5 text-[11px] font-mono"
                  placeholder="#000000"
                  aria-label="色标颜色值"
                />
              </div>
            </Field>

            <Field orientation="horizontal" className="items-center">
              <FieldLabel className="text-[10px] text-muted-foreground w-12">
                位置 (%)
              </FieldLabel>
              <Input
                type="number"
                min={0}
                max={100}
                value={activeStop.position}
                disabled={disabled}
                onChange={(e) => {
                  const num = Number.parseFloat(e.target.value);
                  if (Number.isFinite(num)) {
                    updateActiveStop({
                      position: Math.max(0, Math.min(100, num)),
                    });
                  }
                }}
                className="h-6 flex-1 px-1.5 text-[11px] font-mono"
                aria-label="色标位置"
              />
            </Field>
          </FieldGroup>
        </div>
      )}

      {data.type === "linear" && (
        <div className="flex items-center gap-2">
          <Field orientation="horizontal" className="items-center flex-1">
            <FieldLabel className="text-[10px] text-muted-foreground w-12 flex items-center gap-1">
              <RotateCwIcon className="size-2.5" />
              角度
            </FieldLabel>
            <div className="flex items-center gap-1 flex-1">
              <Input
                type="number"
                min={0}
                max={360}
                value={data.angle}
                disabled={disabled}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value);
                  if (Number.isFinite(val)) setAngle(val);
                }}
                className="h-6 w-16 px-1.5 text-[11px] font-mono"
                aria-label="渐变角度"
              />
              <span className="text-[10px] text-muted-foreground">°</span>
              <div className="flex items-center gap-0.5 ml-auto">
                {[0, 90, 180, 270].map((deg) => (
                  <Button
                    key={deg}
                    type="button"
                    variant={data.angle === deg ? "secondary" : "ghost"}
                    size="xs"
                    className="h-5 px-1 text-[9px]"
                    disabled={disabled}
                    onClick={() => setAngle(deg)}
                  >
                    {deg}°
                  </Button>
                ))}
              </div>
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}
