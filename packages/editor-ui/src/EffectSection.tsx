import * as Collapsible from "@radix-ui/react-collapsible";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  LayersIcon,
  PlusIcon,
  SparklesIcon,
  SquareDashedIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  isShadowHidden,
  isStrokeShadow,
  parseBlur,
  parseShadow,
  serializeBlur,
  serializeShadow,
  setShadowColorVisible,
  splitCssList,
  splitFilterFunctions,
  type BlurValues,
  type ShadowValues,
} from "./effectStyles";
import type { SelectionSummary, StyleRow } from "./types";

export interface EffectSectionProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

type EffectType = "drop" | "inner" | "layer" | "background";
type EffectProperty = "boxShadow" | "filter" | "backdropFilter";

interface ShadowEffect {
  index: number;
  values: ShadowValues;
}

interface BlurEffect {
  index: number;
  values: BlurValues;
}

interface EffectFieldProps {
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
  numeric?: boolean;
  min?: number;
  className?: string;
}

const DROP_SHADOW: ShadowValues = {
  x: "0px",
  y: "4px",
  blur: "12px",
  spread: "0px",
  color: "rgba(0, 0, 0, 0.25)",
  inset: false,
};

const INNER_SHADOW: ShadowValues = {
  ...DROP_SHADOW,
  y: "2px",
  blur: "6px",
  inset: true,
};

function EffectField({
  label,
  value,
  disabled,
  onCommit,
  numeric = false,
  min,
  className,
}: EffectFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(value);
      return;
    }
    if (numeric) {
      const number = Number(trimmed);
      if (!Number.isFinite(number) || (min !== undefined && number < min)) {
        setDraft(value);
        return;
      }
      const normalized = String(number);
      if (normalized !== value) onCommit(normalized);
      else setDraft(value);
      return;
    }
    if (trimmed !== value) onCommit(trimmed);
    else setDraft(value);
  };

  return (
    <Field className={className} data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <Input
        id={id}
        type={numeric ? "number" : "text"}
        min={min}
        step={numeric ? 1 : undefined}
        className={cn("h-6 px-1.5 text-[11px]", !numeric && "font-mono")}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

function lengthInput(value: string): string {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? String(number) : "0";
}

interface ShadowEffectCardProps {
  selectionId: string;
  effect: ShadowEffect;
  row: StyleRow | undefined;
  disabled: boolean;
  onReplace: (property: EffectProperty, index: number, value: string) => void;
  onDelete: (property: EffectProperty, index: number) => void;
}

function ShadowEffectCard({
  selectionId,
  effect,
  row,
  disabled,
  onReplace,
  onDelete,
}: ShadowEffectCardProps) {
  const [open, setOpen] = useState(false);
  const { index, values } = effect;
  const inner = values.inset;
  const label = inner ? "Inner Shadow" : "Drop Shadow";
  const TypeIcon = inner ? SquareDashedIcon : SquareIcon;
  const hidden = isShadowHidden(values.color);
  const readOnly = disabled || Boolean(row?.readOnly);
  const summary = `X ${lengthInput(values.x)} · Y ${lengthInput(values.y)} · Blur ${lengthInput(values.blur)} · Spread ${lengthInput(values.spread)}`;
  const contentId = `${selectionId}-shadow-${index}-parameters`;

  const update = (next: Partial<ShadowValues>) => {
    onReplace("boxShadow", index, serializeShadow({ ...values, ...next }));
  };

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border bg-card/60"
      data-effect-type={inner ? "inner" : "drop"}
      data-hidden={hidden || undefined}
    >
      <div className="flex items-center gap-0.5 p-1">
        <Collapsible.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="min-w-0 flex-1 justify-start px-1 text-[10px] font-normal"
            aria-expanded={open}
            aria-controls={contentId}
          >
            <TypeIcon data-icon="inline-start" />
            <span className="shrink-0">{label}</span>
            <span
              className="min-w-0 flex-1 truncate text-left text-muted-foreground"
              title={summary}
            >
              {summary}
            </span>
            {open ? (
              <ChevronDownIcon data-icon="inline-end" />
            ) : (
              <ChevronRightIcon data-icon="inline-end" />
            )}
          </Button>
        </Collapsible.Trigger>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${hidden ? "Show" : "Hide"} ${label}`}
          aria-pressed={!hidden}
          disabled={readOnly}
          onClick={() =>
            update({ color: setShadowColorVisible(values.color, hidden) })
          }
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${label}`}
          disabled={readOnly}
          onClick={() => onDelete("boxShadow", index)}
        >
          <Trash2Icon />
        </Button>
      </div>
      <Collapsible.Content id={contentId}>
        <FieldGroup className="grid grid-cols-2 gap-2 p-2 pt-0">
          <EffectField
            label="X"
            value={lengthInput(values.x)}
            disabled={readOnly}
            numeric
            onCommit={(value) => update({ x: `${value}px` })}
          />
          <EffectField
            label="Y"
            value={lengthInput(values.y)}
            disabled={readOnly}
            numeric
            onCommit={(value) => update({ y: `${value}px` })}
          />
          <EffectField
            label="Blur"
            value={lengthInput(values.blur)}
            disabled={readOnly}
            numeric
            min={0}
            onCommit={(value) => update({ blur: `${value}px` })}
          />
          <EffectField
            label="Spread"
            value={lengthInput(values.spread)}
            disabled={readOnly}
            numeric
            onCommit={(value) => update({ spread: `${value}px` })}
          />
          <EffectField
            label="Color"
            className="col-span-2"
            value={setShadowColorVisible(values.color, true)}
            disabled={readOnly}
            onCommit={(value) =>
              update({ color: setShadowColorVisible(value, !hidden) })
            }
          />
        </FieldGroup>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

interface BlurEffectCardProps {
  selectionId: string;
  type: "layer" | "background";
  property: "filter" | "backdropFilter";
  effect: BlurEffect;
  row: StyleRow | undefined;
  disabled: boolean;
  onReplace: (property: EffectProperty, index: number, value: string) => void;
  onDelete: (property: EffectProperty, index: number) => void;
}

function BlurEffectCard({
  selectionId,
  type,
  property,
  effect,
  row,
  disabled,
  onReplace,
  onDelete,
}: BlurEffectCardProps) {
  const [open, setOpen] = useState(false);
  const { index, values } = effect;
  const background = type === "background";
  const label = background ? "Background Blur" : "Layer Blur";
  const TypeIcon = background ? LayersIcon : SparklesIcon;
  const readOnly = disabled || Boolean(row?.readOnly);
  const summary = `Radius ${lengthInput(values.radius)} px`;
  const contentId = `${selectionId}-${type}-blur-${index}-parameters`;

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border bg-card/60"
      data-effect-type={type}
      data-hidden={values.hidden || undefined}
    >
      <div className="flex items-center gap-0.5 p-1">
        <Collapsible.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="min-w-0 flex-1 justify-start px-1 text-[10px] font-normal"
            aria-expanded={open}
            aria-controls={contentId}
          >
            <TypeIcon data-icon="inline-start" />
            <span className="shrink-0">{label}</span>
            <span
              className="min-w-0 flex-1 truncate text-left text-muted-foreground"
              title={summary}
            >
              {summary}
            </span>
            {open ? (
              <ChevronDownIcon data-icon="inline-end" />
            ) : (
              <ChevronRightIcon data-icon="inline-end" />
            )}
          </Button>
        </Collapsible.Trigger>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${values.hidden ? "Show" : "Hide"} ${label}`}
          aria-pressed={!values.hidden}
          disabled={readOnly}
          onClick={() =>
            onReplace(
              property,
              index,
              serializeBlur({ ...values, hidden: !values.hidden }),
            )
          }
        >
          {values.hidden ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${label}`}
          disabled={readOnly}
          onClick={() => onDelete(property, index)}
        >
          <Trash2Icon />
        </Button>
      </div>
      <Collapsible.Content id={contentId}>
        <FieldGroup className="gap-2 p-2 pt-0">
          <EffectField
            label="Radius"
            value={lengthInput(values.radius)}
            disabled={readOnly}
            numeric
            min={0}
            onCommit={(value) =>
              onReplace(
                property,
                index,
                serializeBlur({ ...values, radius: `${value}px` }),
              )
            }
          />
        </FieldGroup>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function EffectSection({
  selection,
  disabled,
  onSetStyle,
}: EffectSectionProps) {
  const rows = new Map(selection.styles.map((row) => [row.key, row]));
  const boxShadowRow = rows.get("boxShadow");
  const filterRow = rows.get("filter");
  const backdropFilterRow = rows.get("backdropFilter");
  const shadowSource = splitCssList(boxShadowRow?.value);
  const filterSource = splitFilterFunctions(filterRow?.value);
  const backdropFilterSource = splitFilterFunctions(backdropFilterRow?.value);
  const shadows: ShadowEffect[] = [];
  const layerBlurs: BlurEffect[] = [];
  const backgroundBlurs: BlurEffect[] = [];

  shadowSource.forEach((value, index) => {
    if (isStrokeShadow(value)) return;
    const values = parseShadow(value);
    if (values) shadows.push({ index, values });
  });
  filterSource.forEach((value, index) => {
    const values = parseBlur(value);
    if (values) layerBlurs.push({ index, values });
  });
  backdropFilterSource.forEach((value, index) => {
    const values = parseBlur(value);
    if (values) backgroundBlurs.push({ index, values });
  });

  const sourceFor = (property: EffectProperty): string[] => {
    if (property === "boxShadow") return shadowSource;
    if (property === "filter") return filterSource;
    return backdropFilterSource;
  };

  const replaceEffect = (
    property: EffectProperty,
    index: number,
    value: string,
  ) => {
    const row = rows.get(property);
    if (disabled || row?.readOnly) return;
    const source = [...sourceFor(property)];
    if (index < 0 || index >= source.length) return;
    source[index] = value;
    onSetStyle(property, source.join(property === "boxShadow" ? ", " : " "));
  };

  const deleteEffect = (property: EffectProperty, index: number) => {
    const row = rows.get(property);
    if (disabled || row?.readOnly) return;
    const source = [...sourceFor(property)];
    if (index < 0 || index >= source.length) return;
    source.splice(index, 1);
    onSetStyle(
      property,
      source.length > 0
        ? source.join(property === "boxShadow" ? ", " : " ")
        : null,
    );
  };

  const addEffect = (type: EffectType) => {
    const property: EffectProperty =
      type === "layer"
        ? "filter"
        : type === "background"
          ? "backdropFilter"
          : "boxShadow";
    const row = rows.get(property);
    if (disabled || row?.readOnly) return;
    const source = sourceFor(property).filter(
      (value) => value.toLowerCase() !== "none",
    );
    if (type === "drop" || type === "inner") {
      source.push(
        serializeShadow(type === "inner" ? INNER_SHADOW : DROP_SHADOW),
      );
    } else {
      source.push(
        serializeBlur({
          radius: type === "layer" ? "8px" : "12px",
          hidden: false,
        }),
      );
    }
    onSetStyle(property, source.join(property === "boxShadow" ? ", " : " "));
  };

  const addItem = (
    type: EffectType,
    label: string,
    property: EffectProperty,
    Icon: typeof SquareIcon,
  ) => (
    <DropdownMenuItem
      key={type}
      disabled={disabled || Boolean(rows.get(property)?.readOnly)}
      onSelect={() => addEffect(type)}
    >
      <Icon data-icon="inline-start" />
      {label}
    </DropdownMenuItem>
  );

  return (
    <section className="flex flex-col gap-2" aria-label="Effects">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          Effects
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Add Effect"
              disabled={disabled}
            >
              <PlusIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              {addItem("drop", "Drop Shadow", "boxShadow", SquareIcon)}
              {addItem("inner", "Inner Shadow", "boxShadow", SquareDashedIcon)}
              {addItem("layer", "Layer Blur", "filter", SparklesIcon)}
              {addItem(
                "background",
                "Background Blur",
                "backdropFilter",
                LayersIcon,
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {shadows.map((effect) => (
        <ShadowEffectCard
          key={`${selection.id}-shadow-${effect.index}`}
          selectionId={selection.id}
          effect={effect}
          row={boxShadowRow}
          disabled={disabled}
          onReplace={replaceEffect}
          onDelete={deleteEffect}
        />
      ))}
      {layerBlurs.map((effect) => (
        <BlurEffectCard
          key={`${selection.id}-layer-${effect.index}`}
          selectionId={selection.id}
          type="layer"
          property="filter"
          effect={effect}
          row={filterRow}
          disabled={disabled}
          onReplace={replaceEffect}
          onDelete={deleteEffect}
        />
      ))}
      {backgroundBlurs.map((effect) => (
        <BlurEffectCard
          key={`${selection.id}-background-${effect.index}`}
          selectionId={selection.id}
          type="background"
          property="backdropFilter"
          effect={effect}
          row={backdropFilterRow}
          disabled={disabled}
          onReplace={replaceEffect}
          onDelete={deleteEffect}
        />
      ))}
    </section>
  );
}
