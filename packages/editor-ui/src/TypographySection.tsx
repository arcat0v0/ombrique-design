import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ChevronDownIcon,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseStyleInput } from "./parseStyleInput";
import type { SelectionSummary } from "./types";

export interface TypographySectionProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

interface TypographyValue {
  value: string;
  readOnly: boolean;
}

interface UnitOption {
  value: CssUnit;
  label: string;
  ariaLabel: string;
}

type CssUnit = "px" | "%" | "em" | "unitless";

const FONT_FAMILIES = [
  { label: "System UI", value: "system-ui" },
  { label: "Apple System", value: "-apple-system" },
  { label: "Inter", value: "Inter" },
  { label: "Roboto", value: "Roboto" },
  { label: "Segoe UI", value: "Segoe UI" },
  { label: "Helvetica Neue", value: "Helvetica Neue" },
  { label: "Arial", value: "Arial" },
  { label: "Noto Sans", value: "Noto Sans" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Sans Serif", value: "sans-serif" },
  { label: "Serif", value: "serif" },
  { label: "Monospace", value: "monospace" },
] as const;

const FONT_WEIGHTS = [
  { label: "100 Thin", value: "100" },
  { label: "200 Extra Light", value: "200" },
  { label: "300 Light", value: "300" },
  { label: "400 Regular", value: "400" },
  { label: "500 Medium", value: "500" },
  { label: "600 Semi Bold", value: "600" },
  { label: "700 Bold", value: "700" },
  { label: "800 Extra Bold", value: "800" },
  { label: "900 Black", value: "900" },
  { label: "Normal", value: "normal" },
  { label: "Bold", value: "bold" },
  { label: "Lighter", value: "lighter" },
  { label: "Bolder", value: "bolder" },
] as const;

const LINE_HEIGHT_UNITS: readonly UnitOption[] = [
  { value: "px", label: "px", ariaLabel: "Line height in pixels" },
  { value: "%", label: "%", ariaLabel: "Line height in percent" },
  {
    value: "unitless",
    label: "unitless",
    ariaLabel: "Unitless line height",
  },
];

const LETTER_SPACING_UNITS: readonly UnitOption[] = [
  { value: "px", label: "px", ariaLabel: "Letter spacing in pixels" },
  { value: "em", label: "em", ariaLabel: "Letter spacing in em" },
];

const VALUE_ALIASES: Record<string, readonly string[]> = {
  fontFamily: ["fontFamily", "font-family"],
  fontWeight: ["fontWeight", "font-weight", "weight"],
  fontSize: ["fontSize", "font-size"],
  lineHeight: ["lineHeight", "line-height"],
  letterSpacing: ["letterSpacing", "letter-spacing"],
  textAlign: ["textAlign", "text-align", "align"],
  textDecoration: [
    "textDecoration",
    "text-decoration",
    "textDecorationLine",
    "text-decoration-line",
  ],
};

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const UNIT_VALUE_PATTERN = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%|em)?$/i;

function readTypographyValue(
  selection: SelectionSummary,
  key: string,
): TypographyValue {
  const aliases = VALUE_ALIASES[key] ?? [key];
  const style = selection.styles.find((row) => aliases.includes(row.key));
  if (style) return { value: style.value, readOnly: style.readOnly };
  const attr = selection.attrs.find((row) => aliases.includes(row.key));
  return { value: attr?.value ?? "", readOnly: false };
}

function splitUnitValue(value: string): {
  numeric: string;
  unit: string | null;
} {
  const trimmed = value.trim();
  const match = trimmed.match(UNIT_VALUE_PATTERN);
  return {
    numeric: match?.[1] ?? trimmed,
    unit: match?.[2]?.toLowerCase() ?? null,
  };
}

function formatUnitValue(raw: string, unit: CssUnit): string | number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const { numeric } = splitUnitValue(trimmed);
  if (!NUMBER_PATTERN.test(numeric)) return trimmed;
  if (unit === "unitless") return Number(numeric);
  return `${numeric}${unit}`;
}

function lineHeightUnit(value: string): CssUnit {
  const { unit } = splitUnitValue(value);
  if (unit === "px" || unit === "%") return unit;
  return "unitless";
}

function letterSpacingUnit(value: string): CssUnit {
  const { unit } = splitUnitValue(value);
  if (unit === "em") return "em";
  return "px";
}

function defaultLineHeight(unit: CssUnit): string {
  if (unit === "px") return "24";
  if (unit === "%") return "150";
  return "1.5";
}

function useDraftCommit(
  sourceValue: string,
  selectionId: string,
  onCommit: (raw: string) => void,
) {
  const [draft, setDraftState] = useState(sourceValue);
  const lastCommitted = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset draft when selection id changes
  useEffect(() => {
    setDraftState(sourceValue);
    lastCommitted.current = null;
  }, [selectionId, sourceValue]);

  const setDraft = (value: string) => {
    lastCommitted.current = null;
    setDraftState(value);
  };

  const commit = () => {
    const next = draft.trim();
    if (next === sourceValue.trim() || next === lastCommitted.current) return;
    lastCommitted.current = next;
    onCommit(next);
  };

  const reset = () => {
    lastCommitted.current = draft.trim();
    setDraftState(sourceValue);
  };

  return { draft, setDraft, commit, reset };
}

function handleCommitKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  commit: () => void,
  reset: () => void,
) {
  if (event.key === "Enter") {
    event.preventDefault();
    commit();
    event.currentTarget.blur();
  } else if (event.key === "Escape") {
    event.preventDefault();
    reset();
    event.currentTarget.blur();
  }
}

interface CommitInputProps {
  id: string;
  label: string;
  value: string;
  selectionId: string;
  disabled: boolean;
  placeholder?: string;
  onCommit: (raw: string) => void;
}

function CommitInput({
  id,
  label,
  value,
  selectionId,
  disabled,
  placeholder,
  onCommit,
}: CommitInputProps) {
  const { draft, setDraft, commit, reset } = useDraftCommit(
    value,
    selectionId,
    onCommit,
  );

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className="h-6 px-1.5 text-[11px] font-mono"
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => handleCommitKeyDown(event, commit, reset)}
    />
  );
}

interface UnitInputProps {
  id: string;
  label: string;
  value: string;
  selectionId: string;
  disabled: boolean;
  units: readonly UnitOption[];
  getUnit: (value: string) => CssUnit;
  getDefaultValue: (unit: CssUnit) => string;
  onCommit: (value: string | number | null) => void;
}

function UnitInput({
  id,
  label,
  value,
  selectionId,
  disabled,
  units,
  getUnit,
  getDefaultValue,
  onCommit,
}: UnitInputProps) {
  const sourceValue = splitUnitValue(value).numeric;
  const [unit, setUnit] = useState<CssUnit>(() => getUnit(value));
  const { draft, setDraft, commit, reset } = useDraftCommit(
    sourceValue,
    selectionId,
    (raw) => onCommit(formatUnitValue(raw, unit)),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset unit when selection id changes
  useEffect(() => {
    setUnit(getUnit(value));
  }, [getUnit, selectionId, value]);

  const changeUnit = (nextValue: string) => {
    const option = units.find((item) => item.value === nextValue);
    if (!option || option.value === unit) return;
    const nextUnit = option.value;
    const { numeric } = splitUnitValue(draft);
    const nextDraft = NUMBER_PATTERN.test(numeric)
      ? numeric
      : getDefaultValue(nextUnit);
    setUnit(nextUnit);
    setDraft(nextDraft);
    onCommit(formatUnitValue(nextDraft, nextUnit));
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="h-6 px-1.5 text-[11px] font-mono"
          aria-label={label}
          placeholder="混合"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => handleCommitKeyDown(event, commit, reset)}
        />
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        className="shrink-0"
        value={unit}
        disabled={disabled}
        aria-label={`${label} unit`}
        onValueChange={changeUnit}
      >
        {units.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            disabled={disabled}
            className="h-6 min-w-6 px-1.5 text-[9px]"
            aria-label={option.ariaLabel}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

interface FontFamilyControlProps {
  id: string;
  value: string;
  selectionId: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}

function FontFamilyControl({
  id,
  value,
  selectionId,
  disabled,
  onCommit,
}: FontFamilyControlProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: close search on selection change
  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [selectionId]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFonts = FONT_FAMILIES.filter(
    (font) =>
      !normalizedQuery ||
      font.label.toLowerCase().includes(normalizedQuery) ||
      font.value.toLowerCase().includes(normalizedQuery),
  );
  const exactFont = FONT_FAMILIES.find(
    (font) =>
      font.label.toLowerCase() === normalizedQuery ||
      font.value.toLowerCase() === normalizedQuery,
  );

  const commitFont = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    if (trimmed !== value.trim()) onCommit(trimmed);
    setQuery("");
    setOpen(false);
  };

  const commitQuery = () => {
    if (exactFont) {
      commitFont(exactFont.value);
      return;
    }
    if (filteredFonts.length === 1) {
      commitFont(filteredFonts[0]?.value ?? query);
      return;
    }
    commitFont(query);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          className="w-full min-w-0 justify-between px-1.5 text-[11px] font-normal"
          aria-label="Font family"
        >
          <span className="truncate">{value || "system-ui"}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 min-w-52">
        <div className="p-1">
          <Input
            type="search"
            autoComplete="off"
            spellCheck={false}
            className="h-7 px-2 text-xs"
            aria-label="Search font family"
            placeholder="Search or enter a font"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commitQuery();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
            }}
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {query.trim() && !exactFont && (
            <DropdownMenuItem
              className="truncate text-xs"
              onSelect={() => commitFont(query)}
            >
              Use “{query.trim()}”
            </DropdownMenuItem>
          )}
          <DropdownMenuRadioGroup value={value} onValueChange={commitFont}>
            {filteredFonts.map((font) => (
              <DropdownMenuRadioItem
                key={font.value}
                value={font.value}
                className="text-xs"
              >
                {font.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {filteredFonts.length === 0 && !query.trim() && (
            <DropdownMenuLabel>No fonts available</DropdownMenuLabel>
          )}
          {filteredFonts.length === 0 && query.trim() && (
            <DropdownMenuLabel>No matching fonts</DropdownMenuLabel>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TypographySection({
  selection,
  disabled,
  onSetStyle,
}: TypographySectionProps) {
  const id = useId();
  const isText =
    selection.kind === "text" || selection.tag.toLowerCase() === "text";
  if (!isText) return null;

  const fontFamily = readTypographyValue(selection, "fontFamily");
  const fontWeight = readTypographyValue(selection, "fontWeight");
  const fontSize = readTypographyValue(selection, "fontSize");
  const lineHeight = readTypographyValue(selection, "lineHeight");
  const letterSpacing = readTypographyValue(selection, "letterSpacing");
  const textAlign = readTypographyValue(selection, "textAlign");
  const textDecoration = readTypographyValue(selection, "textDecoration");

  const fontFamilyDisabled = disabled || fontFamily.readOnly;
  const fontWeightDisabled = disabled || fontWeight.readOnly;
  const fontSizeDisabled = disabled || fontSize.readOnly;
  const lineHeightDisabled = disabled || lineHeight.readOnly;
  const letterSpacingDisabled = disabled || letterSpacing.readOnly;
  const textAlignDisabled = disabled || textAlign.readOnly;
  const textDecorationDisabled = disabled || textDecoration.readOnly;

  const weightOption = FONT_WEIGHTS.find(
    (option) => option.value === fontWeight.value,
  );
  const rawAlign = textAlign.value.toLowerCase();
  const alignValue = !rawAlign
    ? "left"
    : rawAlign === "start"
      ? "left"
      : rawAlign === "end"
        ? "right"
        : rawAlign;
  const rawDecoration = textDecoration.value.toLowerCase();
  const decorationValue = rawDecoration.includes("line-through")
    ? "line-through"
    : rawDecoration.includes("underline")
      ? "underline"
      : "none";

  return (
    <section
      className="properties-section flex flex-col gap-1.5"
      aria-label="Typography"
    >
      <span className="px-1 text-[10px] font-medium text-muted-foreground/80">
        Typography 排版
      </span>
      <FieldGroup className="gap-2 rounded-md border border-border bg-card/60 p-2">
        <Field data-disabled={fontFamilyDisabled || undefined}>
          <FieldLabel
            htmlFor={`${id}-font-family`}
            className="text-[10px] text-muted-foreground"
          >
            Font family
          </FieldLabel>
          <FontFamilyControl
            id={`${id}-font-family`}
            value={fontFamily.value}
            selectionId={selection.id}
            disabled={fontFamilyDisabled}
            onCommit={(value) => onSetStyle("fontFamily", value)}
          />
        </Field>

        <FieldGroup className="grid grid-cols-2 gap-2">
          <Field data-disabled={fontSizeDisabled || undefined}>
            <FieldLabel
              htmlFor={`${id}-font-size`}
              className="text-[10px] text-muted-foreground"
            >
              Font size
            </FieldLabel>
            <CommitInput
              id={`${id}-font-size`}
              label="Font size"
              value={fontSize.value}
              selectionId={selection.id}
              disabled={fontSizeDisabled}
              placeholder="16"
              onCommit={(value) =>
                onSetStyle("fontSize", parseStyleInput("fontSize", value))
              }
            />
          </Field>
          <Field data-disabled={fontWeightDisabled || undefined}>
            <FieldLabel
              htmlFor={`${id}-font-weight`}
              className="text-[10px] text-muted-foreground"
            >
              Font weight
            </FieldLabel>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id={`${id}-font-weight`}
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={fontWeightDisabled}
                  className="w-full min-w-0 justify-between px-1.5 text-[11px] font-normal"
                  aria-label="Font weight"
                >
                  <span className="truncate">
                    {weightOption?.label || fontWeight.value || "400 Regular"}
                  </span>
                  <ChevronDownIcon data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 min-w-44">
                <DropdownMenuGroup>
                  <DropdownMenuRadioGroup
                    value={fontWeight.value}
                    onValueChange={(value) =>
                      onSetStyle(
                        "fontWeight",
                        parseStyleInput("fontWeight", value),
                      )
                    }
                  >
                    {FONT_WEIGHTS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="text-xs"
                      >
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
        </FieldGroup>

        <Field data-disabled={lineHeightDisabled || undefined}>
          <FieldLabel
            htmlFor={`${id}-line-height`}
            className="text-[10px] text-muted-foreground"
          >
            Line height
          </FieldLabel>
          <UnitInput
            id={`${id}-line-height`}
            label="Line height"
            value={lineHeight.value}
            selectionId={selection.id}
            disabled={lineHeightDisabled}
            units={LINE_HEIGHT_UNITS}
            getUnit={lineHeightUnit}
            getDefaultValue={defaultLineHeight}
            onCommit={(value) => onSetStyle("lineHeight", value)}
          />
        </Field>

        <Field data-disabled={letterSpacingDisabled || undefined}>
          <FieldLabel
            htmlFor={`${id}-letter-spacing`}
            className="text-[10px] text-muted-foreground"
          >
            Letter spacing
          </FieldLabel>
          <UnitInput
            id={`${id}-letter-spacing`}
            label="Letter spacing"
            value={letterSpacing.value}
            selectionId={selection.id}
            disabled={letterSpacingDisabled}
            units={LETTER_SPACING_UNITS}
            getUnit={letterSpacingUnit}
            getDefaultValue={() => "0"}
            onCommit={(value) => onSetStyle("letterSpacing", value)}
          />
        </Field>

        <Field data-disabled={textAlignDisabled || undefined}>
          <FieldLabel className="text-[10px] text-muted-foreground">
            Text alignment
          </FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            className="w-full"
            value={alignValue}
            disabled={textAlignDisabled}
            aria-label="Text alignment"
            onValueChange={(value) => {
              if (value) onSetStyle("textAlign", value);
            }}
          >
            <ToggleGroupItem
              value="left"
              disabled={textAlignDisabled}
              className="h-6 flex-1"
              aria-label="Align left"
            >
              <AlignLeftIcon />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="center"
              disabled={textAlignDisabled}
              className="h-6 flex-1"
              aria-label="Align center"
            >
              <AlignCenterIcon />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="right"
              disabled={textAlignDisabled}
              className="h-6 flex-1"
              aria-label="Align right"
            >
              <AlignRightIcon />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="justify"
              disabled={textAlignDisabled}
              className="h-6 flex-1"
              aria-label="Align justify"
            >
              <AlignJustifyIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field data-disabled={textDecorationDisabled || undefined}>
          <FieldLabel className="text-[10px] text-muted-foreground">
            Text decoration
          </FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            className="w-full"
            value={decorationValue}
            disabled={textDecorationDisabled}
            aria-label="Text decoration"
            onValueChange={(value) => {
              if (value) onSetStyle("textDecoration", value);
            }}
          >
            <ToggleGroupItem
              value="none"
              disabled={textDecorationDisabled}
              className="h-6 flex-1 px-1.5 text-[10px]"
            >
              None
            </ToggleGroupItem>
            <ToggleGroupItem
              value="underline"
              disabled={textDecorationDisabled}
              className="h-6 flex-1 px-1.5 text-[10px]"
            >
              Underline
            </ToggleGroupItem>
            <ToggleGroupItem
              value="line-through"
              disabled={textDecorationDisabled}
              className="h-6 flex-1 px-1.5 text-[10px]"
            >
              Line through
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldGroup>
    </section>
  );
}
