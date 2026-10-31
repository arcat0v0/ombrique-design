import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CombineIcon,
  ComponentIcon,
  EyeIcon,
  ImageIcon,
  Link2Icon,
  LockIcon,
  PlusIcon,
  Trash2Icon,
  Unlink2Icon,
  ZapIcon,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { parseStyleInput } from "./parseStyleInput";
import type {
  PageTab,
  SelectionSummary,
  StyleRow,
  StyleTarget,
  TokenItem,
  TokenModeItem,
} from "./types";
import type { ExportSetting } from "@ombrique/protocol";
import { CornerRadiusControl } from "./CornerRadiusControl";
import { EffectSection } from "./EffectSection";
import { ExportSection } from "./ExportSection";
import { FillSection } from "./FillSection";
import { StrokeSection } from "./StrokeSection";
import { TypographySection } from "./TypographySection";
const AUTO_LAYOUT_KEYS: Record<string, true> = {
  layout: true,
  align: true,
  justify: true,
  wrap: true,
  grid: true,
  gap: true,
  padding: true,
  paddingTop: true,
  paddingRight: true,
  paddingBottom: true,
  paddingLeft: true,
  alignItems: true,
  justifyContent: true,
  flexWrap: true,
  gridTemplateColumns: true,
  gridTemplateRows: true,
  gridGap: true,
  display: true,
  flexDirection: true,
};

const isFrameTag = (tag: string): boolean => {
  const t = tag.toLowerCase();
  return t === "frame" || t === "section" || t === "group";
};
interface AutoLayoutSectionProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

function AutoLayoutSection({
  selection,
  disabled,
  onSetStyle,
}: AutoLayoutSectionProps) {
  if (!isFrameTag(selection.tag)) return null;
  const isFrameComponent = selection.tag.toLowerCase() === "frame";

  const stylesByKey: Record<string, StyleRow> = {};
  for (const row of selection.styles) stylesByKey[row.key] = row;

  const layout = stylesByKey.layout;
  const display = stylesByKey.display;
  const flexDirection = stylesByKey.flexDirection;
  const gap = stylesByKey.gap;
  const padding = stylesByKey.padding;
  const align = stylesByKey.align;
  const alignItems = stylesByKey.alignItems;
  const justify = stylesByKey.justify;
  const justifyContent = stylesByKey.justifyContent;
  const wrap = stylesByKey.wrap;
  const flexWrap = stylesByKey.flexWrap;
  const gridTemplateColumns = stylesByKey.gridTemplateColumns;
  const gridTemplateRows = stylesByKey.gridTemplateRows;

  const isVertical =
    layout?.value === "vertical" || flexDirection?.value === "column";
  const isHorizontal =
    layout?.value === "horizontal" || flexDirection?.value === "row";
  const _hasFlex =
    isVertical ||
    isHorizontal ||
    display?.value === "flex" ||
    display?.value === "inline-flex";
  const hasGrid = display?.value === "grid" || Boolean(stylesByKey.grid);
  const hasAnyLayoutKey = selection.styles.some(
    (row) => AUTO_LAYOUT_KEYS[row.key] === true,
  );

  const commit = (key: string, raw: string) => {
    onSetStyle(key, parseStyleInput(key, raw));
  };

  if (!hasAnyLayoutKey) {
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          Auto Layout 自动布局
        </span>
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          当前节点尚无布局属性（display/gap/padding
          等）。添加后核心将把布局键路由为真实 prop。
        </p>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          onClick={() => {
            if (isFrameComponent) {
              onSetStyle("layout", "vertical");
              onSetStyle("gap", 8);
            } else {
              onSetStyle("display", "flex");
              onSetStyle("flexDirection", "column");
              onSetStyle("gap", 8);
            }
          }}
          className="h-6 gap-1 text-[10px] font-normal"
          aria-label="添加 Auto Layout"
        >
          <PlusIcon data-icon="inline-start" />
          添加 Auto Layout
        </Button>
      </div>
    );
  }

  return (
    <FieldGroup className="gap-2 rounded-md border border-border bg-card/60 p-2">
      <span className="text-[10px] font-medium text-muted-foreground">
        Auto Layout 自动布局
      </span>

      <Field>
        <FieldLabel className="text-[10px] text-muted-foreground">
          方向
        </FieldLabel>
        <div className="flex items-center gap-1">
          {(
            [
              { label: "None", value: "block", dir: null, layoutVal: "free" },
              {
                label: "Vertical",
                value: "flex",
                dir: "column",
                layoutVal: "vertical",
              },
              {
                label: "Horizontal",
                value: "flex",
                dir: "row",
                layoutVal: "horizontal",
              },
            ] as const
          ).map((opt) => {
            const active =
              opt.dir === null
                ? layout?.value === "free" ||
                  (!isVertical && !isHorizontal && !hasGrid)
                : opt.layoutVal === "vertical"
                  ? isVertical
                  : isHorizontal;
            return (
              <Button
                key={opt.label}
                type="button"
                variant={active ? "secondary" : "outline"}
                size="xs"
                disabled={disabled}
                onClick={() => {
                  if (isFrameComponent) {
                    onSetStyle("layout", opt.layoutVal);
                  } else {
                    onSetStyle("display", opt.value);
                    if (opt.dir) onSetStyle("flexDirection", opt.dir);
                    if (hasGrid) onSetStyle("gridTemplateColumns", null);
                  }
                }}
                className={cn("h-6 flex-1 px-1 text-[10px] font-normal")}
                aria-pressed={active}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
      </Field>

      {hasGrid && (
        <div className="grid grid-cols-2 gap-1.5">
          <Field>
            <FieldLabel className="text-[10px] text-muted-foreground">
              Grid 列
            </FieldLabel>
            <Input
              type="text"
              className="h-6 px-1.5 text-[11px] font-mono"
              aria-label="Grid 列"
              value={gridTemplateColumns?.value ?? ""}
              disabled={disabled || gridTemplateColumns?.readOnly}
              onBlur={(e) => commit("gridTemplateColumns", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit("gridTemplateColumns", e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel className="text-[10px] text-muted-foreground">
              Grid 行
            </FieldLabel>
            <Input
              type="text"
              className="h-6 px-1.5 text-[11px] font-mono"
              aria-label="Grid 行"
              value={gridTemplateRows?.value ?? ""}
              disabled={disabled || gridTemplateRows?.readOnly}
              onBlur={(e) => commit("gridTemplateRows", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit("gridTemplateRows", e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <AutoLayoutValueField
          label="Gap 间距"
          row={gap ?? null}
          disabled={disabled}
          onCommit={(raw) => commit("gap", raw)}
        />
        <AutoLayoutValueField
          label="Padding 内边距"
          row={padding ?? null}
          disabled={disabled}
          onCommit={(raw) => commit("padding", raw)}
        />
      </div>

      <Field>
        <FieldLabel className="text-[10px] text-muted-foreground">
          对齐 Align
        </FieldLabel>
        <div className="flex items-center gap-1">
          {(["flex-start", "center", "flex-end", "stretch"] as const).map(
            (v) => {
              const shortVal = v.replace("flex-", "");
              const active =
                (align?.value ?? alignItems?.value?.replace("flex-", "")) ===
                shortVal;
              return (
                <Button
                  key={v}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="xs"
                  disabled={disabled}
                  onClick={() => {
                    if (isFrameComponent) {
                      onSetStyle("align", shortVal);
                    } else {
                      onSetStyle("alignItems", v);
                    }
                  }}
                  className="h-5 flex-1 px-0.5 text-[9px] font-normal"
                  aria-label={`对齐 ${v}`}
                >
                  {shortVal}
                </Button>
              );
            },
          )}
        </div>
      </Field>

      <Field>
        <FieldLabel className="text-[10px] text-muted-foreground">
          主轴 Justify
        </FieldLabel>
        <div className="flex items-center gap-1">
          {(["flex-start", "center", "flex-end", "space-between"] as const).map(
            (v) => {
              const shortVal = v.replace("flex-", "");
              const active =
                (justify?.value ??
                  justifyContent?.value?.replace("flex-", "")) === shortVal;
              return (
                <Button
                  key={v}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="xs"
                  disabled={disabled}
                  onClick={() => {
                    if (isFrameComponent) {
                      onSetStyle("justify", shortVal);
                    } else {
                      onSetStyle("justifyContent", v);
                    }
                  }}
                  className="h-5 flex-1 px-0.5 text-[9px] font-normal"
                  aria-label={`主轴 ${v}`}
                >
                  {shortVal.replace("space-between", "between")}
                </Button>
              );
            },
          )}
        </div>
      </Field>

      <Field>
        <FieldLabel className="text-[10px] text-muted-foreground">
          Wrap 换行
        </FieldLabel>
        <div className="flex items-center gap-1">
          {(["nowrap", "wrap"] as const).map((v) => {
            const active = wrap
              ? wrap.value === "true" || wrap.value === "wrap"
                ? v === "wrap"
                : v === "nowrap"
              : flexWrap?.value
                ? flexWrap.value === v
                : v === "nowrap";
            return (
              <Button
                key={v}
                type="button"
                variant={active ? "secondary" : "outline"}
                size="xs"
                disabled={disabled}
                onClick={() => {
                  if (isFrameComponent) {
                    onSetStyle("wrap", v === "wrap");
                  } else {
                    onSetStyle("flexWrap", v);
                  }
                }}
                className="h-5 flex-1 px-1 text-[10px] font-normal"
                aria-label={`换行 ${v}`}
              >
                {v}
              </Button>
            );
          })}
        </div>
      </Field>

      <Field>
        <FieldLabel className="text-[10px] text-muted-foreground">
          尺寸模式 W
        </FieldLabel>
        <div className="flex items-center gap-1">
          {(
            [
              { label: "Fixed", value: null },
              { label: "Hug", value: "auto" },
              { label: "Fill", value: "100%" },
            ] as const
          ).map((opt) => {
            const active = opt.value
              ? stylesByKey.width?.value === opt.value
              : !["auto", "100%"].includes(stylesByKey.width?.value ?? "");
            return (
              <Button
                key={opt.label}
                type="button"
                variant={active ? "secondary" : "outline"}
                size="xs"
                disabled={disabled}
                onClick={() => onSetStyle("width", opt.value)}
                className="h-5 flex-1 px-0.5 text-[9px] font-normal"
                aria-label={`宽度 ${opt.label}`}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
      </Field>
    </FieldGroup>
  );
}

interface AutoLayoutValueFieldProps {
  label: string;
  row: StyleRow | null;
  disabled: boolean;
  onCommit: (raw: string) => void;
}

function AutoLayoutValueField({
  label,
  row,
  disabled,
  onCommit,
}: AutoLayoutValueFieldProps) {
  const [val, setVal] = useState(row?.value ?? "");

  useEffect(() => {
    setVal(row?.value ?? "");
  }, [row?.value]);

  const commit = () => {
    const trimmed = val.trim();
    if (row && trimmed === row.value) return;
    onCommit(trimmed);
  };

  return (
    <Field>
      <FieldLabel className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <Input
        type="text"
        className="h-6 px-1.5 text-[11px] font-mono"
        aria-label={label}
        placeholder="混合"
        value={val}
        disabled={disabled || (row?.readOnly ?? false)}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
        }}
      />
      {row?.readOnly && (
        <span className="text-[9px] text-muted-foreground/50">
          {sourceLabel(row)}
        </span>
      )}
    </Field>
  );
}

export interface PropertiesPanelProps {
  selection: SelectionSummary | null;
  tokens?: TokenItem[];
  pages?: PageTab[];
  activePageId?: string | null;
  onSetStyle: (
    key: string,
    value: string | number | boolean | null,
    target?: StyleTarget,
  ) => void;
  onSetText: (text: string) => void;
  onSetName: (name: string) => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onSetAttrs?: (
    attrs: Record<string, string | number | boolean | null>,
  ) => void;
  onDetachInstance?: () => void;
  onFlattenSelection?: () => Promise<boolean> | undefined;
  tokenModes?: TokenModeItem[];
  onExportNode?: (
    formatOrSettings: "png" | "jpg" | "webp" | "svg" | "pdf" | ExportSetting[],
    scale?: number,
  ) => Promise<boolean> | undefined;
}

const SOURCE_LABELS: Record<StyleRow["source"], string> = {
  inline: "元素样式",
  shared: "共享样式",
  token: "变量",
  computed: "计算值",
};

function sourceLabel(row: StyleRow): string {
  if (row.source === "shared") return row.ruleLabel ?? SOURCE_LABELS.shared;
  return SOURCE_LABELS[row.source];
}

const GEOMETRY_KEYS: Record<string, true> = {
  width: true,
  height: true,
  minWidth: true,
  minHeight: true,
  maxWidth: true,
  maxHeight: true,
  left: true,
  top: true,
  right: true,
  bottom: true,
  position: true,
  x: true,
  y: true,
  transform: true,
  zIndex: true,
  boxSizing: true,
};

const LAYOUT_KEYS: Record<string, true> = {
  display: true,
  flexDirection: true,
  flexWrap: true,
  justifyContent: true,
  alignItems: true,
  alignContent: true,
  gap: true,
  rowGap: true,
  columnGap: true,
  flex: true,
  flexGrow: true,
  flexShrink: true,
  flexBasis: true,
  order: true,
  gridTemplateColumns: true,
  gridTemplateRows: true,
  gridAutoColumns: true,
  gridAutoRows: true,
  gridAutoFlow: true,
  gridGap: true,
  overflow: true,
  overflowX: true,
  overflowY: true,
};

const TYPOGRAPHY_KEYS: Record<string, true> = {
  fontFamily: true,
  fontSize: true,
  fontWeight: true,
  fontStyle: true,
  lineHeight: true,
  letterSpacing: true,
  textAlign: true,
  textDecoration: true,
  textTransform: true,
  whiteSpace: true,
  textOverflow: true,
  wordBreak: true,
  color: true,
};

const APPEARANCE_KEYS: Record<string, true> = {
  backgroundColor: true,
  background: true,
  backgroundImage: true,
  backgroundSize: true,
  backgroundPosition: true,
  opacity: true,
  visibility: true,
  borderRadius: true,
  borderTopLeftRadius: true,
  borderTopRightRadius: true,
  borderBottomLeftRadius: true,
  borderBottomRightRadius: true,
  border: true,
  borderWidth: true,
  borderStyle: true,
  borderColor: true,
  borderTop: true,
  borderRight: true,
  borderBottom: true,
  borderLeft: true,
  boxShadow: true,
  backdropFilter: true,
  filter: true,
  outline: true,
  outlineWidth: true,
  outlineStyle: true,
  outlineColor: true,
  fill: true,
  stroke: true,
  strokeWidth: true,
};

const DEDICATED_INLINE_KEYS: Record<string, true> = {
  x: true,
  y: true,
  left: true,
  top: true,
  width: true,
  height: true,
  name: true,
};

interface StyleGroup {
  name: string;
  rows: StyleRow[];
}

function classifyStyleGroups(styles: StyleRow[], tag?: string): StyleGroup[] {
  const lowerTag = tag?.toLowerCase();
  const isFrame = lowerTag ? isFrameTag(lowerTag) : false;
  const isImage = lowerTag === "image";
  const isBoolean = lowerTag === "boolean";
  const isTextNode = lowerTag === "text";
  const isRectOrFrame = lowerTag === "rect" || lowerTag === "frame";

  const shared: StyleRow[] = [];
  const geometry: StyleRow[] = [];
  const layout: StyleRow[] = [];
  const typography: StyleRow[] = [];
  const appearance: StyleRow[] = [];
  const others: StyleRow[] = [];

  for (const row of styles) {
    if (row.source === "shared") {
      shared.push(row);
      continue;
    }

    if (DEDICATED_INLINE_KEYS[row.key]) {
      continue;
    }
    if (isImage && row.key === "src") {
      continue;
    }
    if (isBoolean && row.key === "op") {
      continue;
    }
    if (lowerTag === "frame" && row.key === "mode") {
      continue;
    }
    if (isFrame && AUTO_LAYOUT_KEYS[row.key]) {
      continue;
    }
    if (isTextNode && TYPOGRAPHY_KEYS[row.key]) {
      continue;
    }
    if (
      isRectOrFrame &&
      (row.key === "borderRadius" ||
        row.key === "radius" ||
        row.key.startsWith("radius") ||
        (row.key.startsWith("border") && row.key.endsWith("Radius")))
    ) {
      continue;
    }
    if (
      row.key === "fill" ||
      row.key === "background" ||
      row.key === "backgroundImage" ||
      row.key === "backgroundColor" ||
      row.key === "backgroundSize" ||
      row.key === "backgroundPosition"
    ) {
      continue;
    }
    if (
      row.key === "stroke" ||
      row.key === "strokeWidth" ||
      row.key === "border" ||
      row.key === "borderWidth" ||
      row.key === "borderColor" ||
      row.key === "borderTop" ||
      row.key === "borderRight" ||
      row.key === "borderBottom" ||
      row.key === "borderLeft"
    ) {
      continue;
    }
    if (
      row.key === "boxShadow" ||
      row.key === "filter" ||
      row.key === "backdropFilter"
    ) {
      continue;
    }

    if (GEOMETRY_KEYS[row.key]) {
      geometry.push(row);
    } else if (LAYOUT_KEYS[row.key]) {
      layout.push(row);
    } else if (TYPOGRAPHY_KEYS[row.key]) {
      typography.push(row);
    } else if (APPEARANCE_KEYS[row.key]) {
      appearance.push(row);
    } else {
      others.push(row);
    }
  }

  const groups: StyleGroup[] = [];
  if (shared.length > 0) groups.push({ name: "共享样式", rows: shared });
  if (geometry.length > 0)
    groups.push({ name: "Geometry 尺寸位置", rows: geometry });
  if (layout.length > 0) groups.push({ name: "Layout 布局", rows: layout });
  if (typography.length > 0)
    groups.push({ name: "Typography 排版", rows: typography });
  if (appearance.length > 0)
    groups.push({ name: "Appearance 外观", rows: appearance });
  if (others.length > 0) groups.push({ name: "Other 属性", rows: others });

  return groups;
}

interface StyleValueInputProps {
  row: StyleRow;
  disabled: boolean;
  tokens?: TokenItem[];
  onCommit: (key: string, value: string, target?: StyleTarget) => void;
}

function StyleValueInput({
  row,
  disabled,
  tokens = [],
  onCommit,
}: StyleValueInputProps) {
  const [val, setVal] = useState(row.value);

  useEffect(() => {
    setVal(row.value);
  }, [row.value]);

  const isShared = row.source === "shared";
  const target: StyleTarget = isShared
    ? {
        source: "shared",
        file: row.file,
        start: row.start,
        end: row.end,
        selector: row.selector,
        sourceId: row.sourceId,
      }
    : { source: "inline" };

  const commit = () => {
    if (val === row.value) return;
    onCommit(row.key, val, target);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      (event.target as HTMLElement).blur();
    } else if (event.key === "Escape") {
      setVal(row.value);
      (event.target as HTMLElement).blur();
    }
  };

  const sourceText =
    isShared && row.file && row.selector
      ? `${row.file}:${row.selector}`
      : sourceLabel(row);

  return (
    <div
      className={cn(
        "style-row flex h-7 items-center justify-between gap-1.5 px-2 py-0.5 text-xs hover:bg-muted/30 transition-colors",
        isShared && "bg-primary/5",
      )}
    >
      <span
        className="style-key w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground"
        title={row.key}
      >
        {row.key}
      </span>
      <Input
        type="text"
        className="style-value field-input h-6 flex-1 px-1.5 text-xs font-mono"
        aria-label={`样式 ${row.key}`}
        value={val}
        disabled={disabled || row.readOnly}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />

      {tokens.length > 0 && !disabled && !row.readOnly && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`绑定设计变量至 ${row.key}`}
                >
                  <Link2Icon className="size-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">绑定设计变量</TooltipContent>
          </Tooltip>

          <DropdownMenuContent
            align="end"
            className="w-56 max-h-60 overflow-y-auto"
          >
            <DropdownMenuLabel className="text-[11px]">
              绑定设计变量
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {tokens.map((token) => (
              <DropdownMenuItem
                key={token.name}
                className="flex items-center justify-between text-xs font-mono cursor-pointer"
                onClick={() => {
                  const varRef = `var(${token.name})`;
                  setVal(varRef);
                  onCommit(row.key, varRef, { source: "token" });
                }}
              >
                <span className="truncate flex-1">{token.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                  {token.value}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {(row.readOnly || isShared || row.source === "token") && (
        <Badge
          variant={isShared ? "default" : "outline"}
          className={cn(
            "style-source h-4 max-w-[120px] truncate px-1 text-[9px] font-normal shrink-0",
            isShared
              ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
              : "text-muted-foreground/70",
          )}
          title={sourceText}
        >
          {sourceText}
        </Badge>
      )}
    </div>
  );
}

interface GeometryField {
  label: string;
  key: string;
  row: StyleRow | null;
  onCommit: (key: string, value: string) => void;
  disabled: boolean;
}

function GeometryInput({ field }: { field: GeometryField }) {
  const { row, key, label, onCommit, disabled } = field;
  const [val, setVal] = useState(row?.value ?? "");

  useEffect(() => {
    setVal(row?.value ?? "");
  }, [row?.value]);

  const commit = () => {
    const trimmed = val.trim();
    if (!row) {
      if (trimmed === "") return;
      onCommit(key, trimmed);
      return;
    }
    if (trimmed === row.value) return;
    onCommit(key, trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      (event.target as HTMLElement).blur();
    } else if (event.key === "Escape") {
      setVal(row?.value ?? "");
      (event.target as HTMLElement).blur();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-5 shrink-0 text-center font-mono text-[11px] font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="relative flex-1">
        <Input
          type="text"
          className="h-6 w-full px-1.5 text-[11px] font-mono"
          aria-label={`${label} 坐标值`}
          placeholder="混合"
          value={val}
          disabled={disabled || row?.readOnly}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        {row?.readOnly && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/50 pointer-events-none">
            {sourceLabel(row)}
          </span>
        )}
      </div>
    </div>
  );
}

const CONSTRAINT_H_CHOICES = ["left", "center", "right", "stretch"] as const;
const CONSTRAINT_V_CHOICES = ["top", "middle", "bottom", "stretch"] as const;

type ConstraintMode = (typeof CONSTRAINT_H_CHOICES)[number];

const CONSTRAINT_H_CSS: Record<
  ConstraintMode,
  (w: string) => Record<string, string | undefined>
> = {
  left: () => ({ left: "0px", right: "auto" }),
  right: () => ({ right: "0px", left: "auto" }),
  center: (w) => ({
    left: "50%",
    right: "auto",
    transform: "translateX(-50%)",
    marginLeft: w !== "auto" ? `calc(${w} / -2)` : undefined,
  }),
  stretch: () => ({ left: "0px", right: "0px", width: "auto" }),
};

interface ConstraintSectionProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

function ConstraintSection({
  selection,
  disabled,
  onSetStyle,
}: ConstraintSectionProps) {
  const stylesByKey: Record<string, StyleRow> = {};
  for (const row of selection.styles) stylesByKey[row.key] = row;

  const position = stylesByKey.position;
  const left = stylesByKey.left;
  const right = stylesByKey.right;
  const top = stylesByKey.top;
  const bottom = stylesByKey.bottom;
  const width = stylesByKey.width;
  const height = stylesByKey.height;

  const hasConstraintFields = Boolean(
    position || left || right || top || bottom || width || height,
  );

  if (!hasConstraintFields) return null;

  const canEditPosition =
    !disabled &&
    position !== undefined &&
    !position.readOnly &&
    (position.value === "absolute" ||
      position.value === "fixed" ||
      position.value === "relative");

  const applyHorizontal = (mode: ConstraintMode) => {
    if (!canEditPosition) return;
    const w = width?.value ?? "auto";
    const css = CONSTRAINT_H_CSS[mode](w);
    for (const [k, v] of Object.entries(css)) {
      if (v === undefined) continue;
      onSetStyle(k, parseStyleInput(k, v));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium text-muted-foreground/80 px-1">
        Constraint 约束
      </span>
      {canEditPosition ? (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-card/60 p-2">
          <div className="flex items-center gap-1">
            {CONSTRAINT_H_CHOICES.map((mode) => (
              <Button
                key={mode}
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                onClick={() => applyHorizontal(mode)}
                className="h-5 flex-1 px-1 text-[10px] font-normal capitalize"
                aria-label={`水平约束 ${mode}`}
              >
                {mode}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {CONSTRAINT_V_CHOICES.map((mode) => (
              <Button
                key={mode}
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                onClick={() => {
                  if (!canEditPosition) return;
                  if (mode === "top") {
                    onSetStyle("top", 0);
                    onSetStyle("bottom", null);
                  } else if (mode === "bottom") {
                    onSetStyle("bottom", 0);
                    onSetStyle("top", null);
                  } else if (mode === "middle") {
                    onSetStyle("top", "50%");
                    onSetStyle("bottom", null);
                    onSetStyle("transform", "translateY(-50%)");
                  } else {
                    onSetStyle("top", 0);
                    onSetStyle("bottom", 0);
                    onSetStyle("height", null);
                  }
                }}
                className="h-5 flex-1 px-1 text-[10px] font-normal capitalize"
                aria-label={`垂直约束 ${mode}`}
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-2 text-[10px] text-muted-foreground">
          {disabled
            ? "该图层不可编辑"
            : `当前 position=${position?.value ?? "未设置"}，仅 absolute/fixed/relative 支持约束编辑`}
        </div>
      )}
    </div>
  );
}

interface ImageCardProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (
    key: string,
    value: string | number | boolean | null,
    target?: StyleTarget,
  ) => void;
}

function ImageCard({ selection, disabled, onSetStyle }: ImageCardProps) {
  const srcProp =
    selection.attrs.find((a) => a.key === "src")?.value ??
    selection.styles.find((s) => s.key === "src")?.value ??
    "";
  const radiusProp =
    selection.styles.find((s) => s.key === "borderRadius" || s.key === "radius")
      ?.value ??
    selection.attrs.find((a) => a.key === "radius")?.value ??
    "";
  const opacityProp =
    selection.styles.find((s) => s.key === "opacity")?.value ??
    selection.attrs.find((a) => a.key === "opacity")?.value ??
    "";

  const [srcVal, setSrcVal] = useState(srcProp);
  const [radiusVal, setRadiusVal] = useState(radiusProp);
  const [opacityVal, setOpacityVal] = useState(opacityProp);

  useEffect(() => {
    setSrcVal(srcProp);
  }, [srcProp]);

  useEffect(() => {
    setRadiusVal(radiusProp);
  }, [radiusProp]);

  useEffect(() => {
    setOpacityVal(opacityProp);
  }, [opacityProp]);

  const commitSrc = () => {
    const trimmed = srcVal.trim();
    if (trimmed === srcProp) return;
    onSetStyle("src", trimmed || null);
  };

  const commitRadius = () => {
    const trimmed = radiusVal.trim();
    if (trimmed === radiusProp) return;
    onSetStyle("radius", parseStyleInput("radius", trimmed));
  };

  const commitOpacity = () => {
    const trimmed = opacityVal.trim();
    if (trimmed === opacityProp) return;
    onSetStyle("opacity", parseStyleInput("opacity", trimmed));
  };

  return (
    <div
      className="image-card flex flex-col gap-2 rounded-md border border-border bg-card/60 p-2.5"
      data-testid="image-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <ImageIcon className="size-3.5 text-primary shrink-0" />
          <span className="font-semibold text-xs text-foreground">
            图片资源
          </span>
        </div>
        <Badge
          variant="outline"
          className="h-4 px-1 text-[9px] font-mono shrink-0"
        >
          Image
        </Badge>
      </div>

      <div className="flex items-start gap-2.5">
        <div className="size-14 shrink-0 rounded border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
          {srcVal ? (
            <img
              src={srcVal}
              alt="图片预览"
              className="size-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground/40" />
          )}
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Field>
            <FieldLabel className="text-[10px] text-muted-foreground">
              图片路径 (src)
            </FieldLabel>
            <Input
              type="text"
              aria-label="图片源路径"
              className="h-6 px-1.5 font-mono text-[11px]"
              placeholder="assets/photo.png 或 https://..."
              value={srcVal}
              disabled={disabled}
              onChange={(e) => setSrcVal(e.target.value)}
              onBlur={commitSrc}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitSrc();
                  e.currentTarget.blur();
                }
              }}
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-border/40">
        <Field>
          <FieldLabel className="text-[10px] text-muted-foreground">
            圆角 (radius)
          </FieldLabel>
          <Input
            type="text"
            aria-label="圆角半径"
            className="h-6 px-1.5 font-mono text-[11px]"
            placeholder="0"
            value={radiusVal}
            disabled={disabled}
            onChange={(e) => setRadiusVal(e.target.value)}
            onBlur={commitRadius}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRadius();
                e.currentTarget.blur();
              }
            }}
          />
        </Field>
        <Field>
          <FieldLabel className="text-[10px] text-muted-foreground">
            透明度 (opacity)
          </FieldLabel>
          <Input
            type="text"
            aria-label="图片透明度"
            className="h-6 px-1.5 font-mono text-[11px]"
            placeholder="1"
            value={opacityVal}
            disabled={disabled}
            onChange={(e) => setOpacityVal(e.target.value)}
            onBlur={commitOpacity}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitOpacity();
                e.currentTarget.blur();
              }
            }}
          />
        </Field>
      </div>
    </div>
  );
}

interface BooleanCardProps {
  selection: SelectionSummary;
  disabled: boolean;
  onSetStyle: (
    key: string,
    value: string | number | boolean | null,
    target?: StyleTarget,
  ) => void;
  onFlattenSelection?: () => Promise<boolean> | undefined;
}
const BOOLEAN_OPS = [
  { key: "union", label: "Union 联集" },
  { key: "subtract", label: "Subtract 减去顶层" },
  { key: "intersect", label: "Intersect 交集" },
  { key: "exclude", label: "Exclude 排除重叠" },
] as const;

function BooleanCard({
  selection,
  disabled,
  onSetStyle,
  onFlattenSelection,
}: BooleanCardProps) {
  const currentOp = (
    selection.attrs.find((a) => a.key === "op")?.value ??
    selection.styles.find((s) => s.key === "op")?.value ??
    "union"
  ).toLowerCase();

  return (
    <div
      className="boolean-card flex flex-col gap-2 rounded-md border border-border bg-card/60 p-2.5"
      data-testid="boolean-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <CombineIcon className="size-3.5 text-primary shrink-0" />
          <span className="font-semibold text-xs text-foreground">
            布尔运算
          </span>
        </div>
        <Badge
          variant="outline"
          className="h-4 px-1 text-[9px] font-mono shrink-0"
        >
          Boolean
        </Badge>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">
          运算模式 (Operation)
        </span>
        <div className="grid grid-cols-2 gap-1">
          {BOOLEAN_OPS.map((op) => {
            const active = currentOp === op.key;
            return (
              <Button
                key={op.key}
                type="button"
                variant={active ? "secondary" : "outline"}
                size="xs"
                disabled={disabled}
                onClick={() => onSetStyle("op", op.key)}
                className="h-6 text-[10px] font-normal justify-start px-2"
                aria-pressed={active}
                aria-label={`布尔运算 ${op.key}`}
              >
                {op.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="pt-1 border-t border-border/40 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          拼合为独立矢量
        </span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled || !onFlattenSelection}
          onClick={() => {
            void onFlattenSelection?.();
          }}
          className="h-6 gap-1 px-2 text-[10px] font-normal"
          title="将布尔运算图层拼合为单一静态矢量路径"
          aria-label="拼合矢量"
        >
          <CombineIcon className="size-3" />
          <span>拼合矢量 (Flatten)</span>
        </Button>
      </div>
    </div>
  );
}

interface ModeSectionProps {
  selection: SelectionSummary;
  tokenModes: TokenModeItem[];
  disabled: boolean;
  onSetAttrs?: (
    attrs: Record<string, string | number | boolean | null>,
  ) => void;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

function ModeSection({
  selection,
  tokenModes,
  disabled,
  onSetAttrs,
  onSetStyle,
}: ModeSectionProps) {
  if (selection.tag.toLowerCase() !== "frame") return null;
  const current =
    selection.styles.find((row) => row.key === "mode")?.value ??
    selection.attrs.find((attr) => attr.key === "mode")?.value ??
    "";
  if (tokenModes.length === 0 && current === "") return null;
  const choose = (value: string | null) => {
    if (onSetAttrs) {
      onSetAttrs({ mode: value });
    } else {
      onSetStyle("mode", value);
    }
  };
  const options: Array<{ value: string | null; label: string }> = [
    { value: null, label: "继承 (Inherit)" },
    ...tokenModes.map((mode) => ({
      value: mode.name,
      label: mode.isDefault ? `${mode.name} (默认)` : mode.name,
    })),
  ];
  if (current !== "" && !tokenModes.some((mode) => mode.name === current)) {
    options.push({ value: current, label: current });
  }
  return (
    <div className="properties-section flex flex-col gap-2 border-t border-border/40 pt-2">
      <FieldGroup className="flex flex-col gap-1.5">
        <Field className="flex flex-col gap-1">
          <FieldLabel className="text-[10px] text-muted-foreground">
            变量模式 (Mode)
          </FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                aria-label="选择变量模式"
                data-testid="mode-trigger"
                className="h-6 w-full justify-between px-2 text-[10px] font-normal"
              >
                <span className="truncate">
                  {current === "" ? "继承 (Inherit)" : current}
                </span>
                <ChevronDownIcon className="size-3 opacity-60 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuGroup>
                {options.map((opt) => {
                  const active = (opt.value ?? "") === current;
                  return (
                    <DropdownMenuItem
                      key={opt.value ?? ""}
                      onClick={() => choose(opt.value)}
                      data-testid={`mode-option-${opt.value ?? "inherit"}`}
                      className={cn(
                        "text-xs cursor-pointer justify-between",
                        active && "font-semibold text-primary",
                      )}
                    >
                      <span>{opt.label}</span>
                      {active && (
                        <CheckIcon className="size-3 text-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>
      </FieldGroup>
    </div>
  );
}

interface PrototypeSectionProps {
  selection: SelectionSummary;
  pages?: PageTab[];
  disabled: boolean;
  onSetAttrs?: (
    attrs: Record<string, string | number | boolean | null>,
  ) => void;
  onSetStyle: (key: string, value: string | number | boolean | null) => void;
}

const TRIGGER_OPTIONS = [
  { value: "click", label: "On Click (点击时)" },
  { value: "hover", label: "On Hover (悬停时)" },
];

const ACTION_OPTIONS = [
  { value: "navigate", label: "Navigate To (导航至页面)" },
  { value: "overlay", label: "Open Overlay (打开悬浮层)" },
];

const TRANSITION_OPTIONS = [
  { value: "instant", label: "Instant (即时)" },
  { value: "dissolve", label: "Dissolve (渐变溶解)" },
  { value: "slide-left", label: "Slide Left (左滑移入)" },
  { value: "slide-right", label: "Slide Right (右滑移入)" },
  { value: "slide-up", label: "Slide Up (上滑移入)" },
  { value: "slide-down", label: "Slide Down (下滑移入)" },
];

function PrototypeSection({
  selection,
  pages = [],
  disabled,
  onSetAttrs,
  onSetStyle,
}: PrototypeSectionProps) {
  const stylesByKey: Record<string, string> = {};
  for (const s of selection.styles) {
    if (s.value !== null && s.value !== undefined) {
      stylesByKey[s.key] = String(s.value);
    }
  }
  const attrsByKey: Record<string, string> = {};
  for (const a of selection.attrs) {
    attrsByKey[a.key] = a.value;
  }

  const navigateTarget =
    stylesByKey.onClickNavigate || attrsByKey["data-prototype-navigate"] || "";

  const hoverStyleStr =
    stylesByKey.onHoverStyle || attrsByKey["data-prototype-hover"] || "";

  const isConfigured = Boolean(navigateTarget || hoverStyleStr);

  const initialTransition =
    stylesByKey.transitionType ||
    attrsByKey["data-prototype-transition"] ||
    "instant";
  let initialDuration = 300;
  const rawDuration =
    stylesByKey.transitionDuration || attrsByKey["data-prototype-duration"];
  if (rawDuration) {
    const n = Number(rawDuration);
    if (!Number.isNaN(n)) initialDuration = n;
  }

  const [trigger, setTrigger] = useState(
    hoverStyleStr && !navigateTarget ? "hover" : "click",
  );
  const [action, setAction] = useState(
    hoverStyleStr && !navigateTarget ? "overlay" : "navigate",
  );
  const [destination, setDestination] = useState(navigateTarget);
  const [transitionType, setTransitionType] = useState(initialTransition);
  const [duration, setDuration] = useState(initialDuration);

  useEffect(() => {
    setDestination(navigateTarget);
    setTrigger(hoverStyleStr && !navigateTarget ? "hover" : "click");
    setAction(hoverStyleStr && !navigateTarget ? "overlay" : "navigate");
    setTransitionType(initialTransition);
    setDuration(initialDuration);
  }, [navigateTarget, hoverStyleStr, initialTransition, initialDuration]);
  if (!isFrameTag(selection.tag)) return null;

  const commit = (updates: {
    trigger?: string;
    action?: string;
    destination?: string;
    transitionType?: string;
    duration?: number;
  }) => {
    const nextAction = updates.action ?? action;
    const nextDestination = updates.destination ?? destination;
    const nextTransition = updates.transitionType ?? transitionType;
    const nextDuration = updates.duration ?? duration;

    const attrs: Record<string, string | number | boolean | null> = {};
    if (nextAction === "navigate") {
      attrs.onClickNavigate = nextDestination || null;
      attrs.cursor = nextDestination ? "pointer" : null;
      attrs.transitionType = nextDestination ? nextTransition : null;
      attrs.transitionDuration = nextDestination ? nextDuration : null;
      attrs.onHoverStyle = null;
    } else {
      attrs.onClickNavigate = nextDestination || null;
      attrs.cursor = "pointer";
      attrs.onHoverStyle = "{ opacity: 0.85 }";
      attrs.transitionType = nextTransition;
      attrs.transitionDuration = nextDuration;
    }

    if (onSetAttrs) {
      onSetAttrs(attrs);
    } else {
      for (const [k, v] of Object.entries(attrs)) {
        onSetStyle(k, v);
      }
    }
  };

  const clearInteraction = () => {
    const clearAttrs = {
      onClickNavigate: null,
      cursor: null,
      transitionType: null,
      transitionDuration: null,
      onHoverStyle: null,
    };
    if (onSetAttrs) {
      onSetAttrs(clearAttrs);
    } else {
      for (const [k, v] of Object.entries(clearAttrs)) {
        onSetStyle(k, v);
      }
    }
    setDestination("");
  };

  const targetPageName =
    pages.find((p) => p.id === destination || p.file === destination)?.name ??
    destination;

  return (
    <div className="properties-section flex flex-col gap-2 border-t border-border/40 pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ZapIcon className="size-3.5 text-primary" />
          <span className="text-[11px] font-medium text-foreground">
            交互原型 (Prototype)
          </span>
        </div>
        {isConfigured && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            onClick={clearInteraction}
            className="size-5 text-muted-foreground hover:text-destructive"
            title="移除交互"
            aria-label="移除交互"
          >
            <Trash2Icon className="size-3" />
          </Button>
        )}
      </div>

      <FieldGroup className="flex flex-col gap-1.5">
        <Field className="flex flex-col gap-1">
          <FieldLabel className="text-[10px] text-muted-foreground">
            触发方式 (Trigger)
          </FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                className="h-6 w-full justify-between px-2 text-[11px] font-normal"
              >
                <span>
                  {TRIGGER_OPTIONS.find((t) => t.value === trigger)?.label ??
                    trigger}
                </span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuGroup>
                {TRIGGER_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => {
                      setTrigger(opt.value);
                      commit({ trigger: opt.value });
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <span>{opt.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field className="flex flex-col gap-1">
          <FieldLabel className="text-[10px] text-muted-foreground">
            动作 (Action)
          </FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                className="h-6 w-full justify-between px-2 text-[11px] font-normal"
              >
                <span>
                  {ACTION_OPTIONS.find((a) => a.value === action)?.label ??
                    action}
                </span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuGroup>
                {ACTION_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => {
                      setAction(opt.value);
                      commit({ action: opt.value });
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <span>{opt.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field className="flex flex-col gap-1">
          <FieldLabel className="text-[10px] text-muted-foreground">
            目标页面 (Destination)
          </FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                className="h-6 w-full justify-between px-2 text-[11px] font-normal"
              >
                <span className="truncate">
                  {targetPageName ? targetPageName : "选择目标页面..."}
                </span>
                <ChevronDownIcon className="size-3 opacity-60 shrink-0 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuGroup>
                {pages.length === 0 ? (
                  <DropdownMenuItem disabled className="text-xs">
                    暂无可用页面
                  </DropdownMenuItem>
                ) : (
                  pages.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => {
                        setDestination(p.id);
                        commit({ destination: p.id });
                      }}
                      className="text-xs cursor-pointer justify-between"
                    >
                      <span>{p.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {p.id}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <div className="grid grid-cols-2 gap-1.5">
          <Field className="flex flex-col gap-1">
            <FieldLabel className="text-[10px] text-muted-foreground">
              转场动画 (Transition)
            </FieldLabel>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={disabled}
                  className="h-6 w-full justify-between px-2 text-[10px] font-normal"
                >
                  <span className="truncate">
                    {TRANSITION_OPTIONS.find(
                      (t) => t.value === transitionType,
                    )?.label?.split(" ")[0] ?? transitionType}
                  </span>
                  <ChevronDownIcon className="size-3 opacity-60 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuGroup>
                  {TRANSITION_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => {
                        setTransitionType(opt.value);
                        commit({ transitionType: opt.value });
                      }}
                      className="text-xs cursor-pointer"
                    >
                      <span>{opt.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>

          <Field className="flex flex-col gap-1">
            <FieldLabel className="text-[10px] text-muted-foreground">
              时长 (Duration ms)
            </FieldLabel>
            <Input
              type="number"
              min={0}
              step={50}
              value={duration}
              disabled={disabled || transitionType === "instant"}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10);
                const next = Number.isNaN(val) ? 0 : val;
                setDuration(next);
              }}
              onBlur={() => {
                commit({ duration });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commit({ duration });
                }
              }}
              className="h-6 text-[11px] font-mono"
            />
          </Field>
        </div>
      </FieldGroup>
    </div>
  );
}

export function PropertiesPanel({
  selection,
  tokens,
  pages,
  activePageId: _activePageId,
  onSetStyle,
  onSetText,
  onSetName,
  onToggleHidden,
  onToggleLocked,
  onDetachInstance,
  onFlattenSelection,
  onSetAttrs,
  onExportNode,
  tokenModes = [],
}: PropertiesPanelProps) {
  const [name, setName] = useState(selection?.name ?? "");
  const [text, setText] = useState(selection?.text ?? "");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [detachConfirmOpen, setDetachConfirmOpen] = useState(false);
  useEffect(() => {
    setName(selection?.name ?? "");
    setText(selection?.text ?? "");
  }, [selection?.name, selection?.text]);

  const styleGroups = useMemo(() => {
    if (!selection) return [];
    return classifyStyleGroups(selection.styles, selection.tag);
  }, [selection]);

  const geometryRows = useMemo(() => {
    const byKey: Record<string, StyleRow> = {};
    if (!selection) return byKey;
    for (const row of selection.styles) byKey[row.key] = row;
    return byKey;
  }, [selection]);

  const geometryFields: GeometryField[] = useMemo(() => {
    if (!selection) return [];
    return [
      {
        label: "X",
        key: "left",
        row: geometryRows.x ?? geometryRows.left ?? null,
        onCommit: (k, v) => {
          onSetStyle(geometryRows.x ? "x" : "left", parseStyleInput(k, v));
        },
        disabled: !selection.editable,
      },
      {
        label: "Y",
        key: "top",
        row: geometryRows.y ?? geometryRows.top ?? null,
        onCommit: (k, v) => {
          onSetStyle(geometryRows.y ? "y" : "top", parseStyleInput(k, v));
        },
        disabled: !selection.editable,
      },
      {
        label: "W",
        key: "width",
        row: geometryRows.width ?? null,
        onCommit: (k, v) => {
          onSetStyle("width", parseStyleInput(k, v));
        },
        disabled: !selection.editable,
      },
      {
        label: "H",
        key: "height",
        row: geometryRows.height ?? null,
        onCommit: (k, v) => {
          onSetStyle("height", parseStyleInput(k, v));
        },
        disabled: !selection.editable,
      },
    ];
  }, [selection, geometryRows, onSetStyle]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (selection === null) {
    const activePage = pages?.find((p) => p.id === _activePageId);
    const boardName = activePage?.name ?? "当前画板";
    return (
      <section
        className="properties-panel flex h-full flex-col bg-card/40 select-none"
        aria-label="属性面板"
      >
        <div className="panel-heading flex h-8 items-center px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          属性
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-3">
            <div className="properties-empty flex items-center justify-center p-4 text-xs text-muted-foreground">
              未选择图层
            </div>
            <ExportSection
              targetName={boardName}
              isBoard={true}
              onExportNode={onExportNode}
            />
          </div>
        </ScrollArea>
      </section>
    );
  }

  const disabled = !selection.editable;

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === selection.name) return;
    onSetName(trimmed);
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitName();
      (event.target as HTMLElement).blur();
    }
  };

  const commitText = () => {
    if (text === selection.text) return;
    onSetText(text);
  };

  const showConstraint = selection.styles.some((row) =>
    ["position", "left", "right", "top", "bottom", "width", "height"].includes(
      row.key,
    ),
  );

  return (
    <TooltipProvider delayDuration={200}>
      <section
        key={selection.id}
        className="properties-panel flex h-full flex-col bg-card/40 text-xs select-none"
        aria-label="属性面板"
      >
        <div className="panel-heading flex h-8 items-center justify-between border-b border-border px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>属性</span>
          <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
            {selection.tag}
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-3">
            {disabled && (
              <div
                className="properties-notice rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive-foreground"
                role="note"
              >
                {selection.readOnlyReason ?? "该图层不可编辑"}
              </div>
            )}

            {selection.kind === "component" && (
              <div
                className="component-instance-card flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5"
                data-testid="component-instance-card"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ComponentIcon className="size-3.5 text-primary shrink-0" />
                    <span className="font-semibold text-xs text-foreground truncate">
                      {selection.componentName ?? selection.name}
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="h-4 px-1 text-[9px] font-mono shrink-0 bg-primary/10 text-primary border-primary/20"
                  >
                    组件实例
                  </Badge>
                </div>

                <p className="text-[10px] leading-relaxed text-muted-foreground/90">
                  编辑此实例属性仅影响当前元素；双击将进入主组件源码。
                </p>
                {selection.variantAxes && selection.variantAxes.length > 0 && (
                  <div
                    className="variant-controls flex flex-col gap-2 pt-2 border-t border-primary/20"
                    data-testid="variant-controls"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-foreground">
                        变体属性
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[9px] font-mono text-muted-foreground"
                      >
                        {selection.variantAxes.length} 维
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {selection.variantAxes.map((axis) => {
                        const currentPropVal =
                          selection.variantProps?.[axis.name] ??
                          selection.attrs.find((a) => a.key === axis.name)
                            ?.value ??
                          axis.values[0];

                        return (
                          <div
                            key={axis.name}
                            className="flex items-center justify-between gap-2"
                            data-testid={`variant-axis-${axis.name}`}
                          >
                            <span className="text-xs text-muted-foreground font-mono truncate">
                              {axis.name}
                            </span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  className="h-6 min-w-24 justify-between gap-1 text-xs font-mono font-normal"
                                  aria-label={`选择 ${axis.name}`}
                                  disabled={disabled}
                                  data-testid={`variant-trigger-${axis.name}`}
                                >
                                  <span className="truncate">
                                    {String(currentPropVal)}
                                  </span>
                                  <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="min-w-28 font-mono"
                                data-testid={`variant-menu-${axis.name}`}
                              >
                                <DropdownMenuGroup>
                                  {axis.values.map((val) => (
                                    <DropdownMenuItem
                                      key={val}
                                      className={cn(
                                        "text-xs cursor-pointer justify-between",
                                        val === String(currentPropVal) &&
                                          "font-semibold text-primary",
                                      )}
                                      onClick={() => {
                                        if (onSetAttrs) {
                                          onSetAttrs({ [axis.name]: val });
                                        } else {
                                          onSetStyle(axis.name, val);
                                        }
                                      }}
                                      data-testid={`variant-option-${axis.name}-${val}`}
                                    >
                                      <span>{val}</span>
                                      {val === String(currentPropVal) && (
                                        <CheckIcon className="size-3 text-primary shrink-0" />
                                      )}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <AlertDialog
                  open={detachConfirmOpen}
                  onOpenChange={setDetachConfirmOpen}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-6 gap-1 px-2 text-[10px] font-normal text-muted-foreground hover:text-foreground self-start"
                      disabled={disabled || !onDetachInstance}
                      title="将组件展开为独立静态图层"
                      aria-label="分离实例"
                    >
                      <Unlink2Icon className="size-3" />
                      <span>分离实例</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent position="right-panel">
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认分离组件实例？</AlertDialogTitle>
                      <AlertDialogDescription className="text-xs">
                        将该组件展开为独立静态图层，后续主组件代码更新将不再同步至该元素。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel size="sm">取消</AlertDialogCancel>
                      <AlertDialogAction
                        size="sm"
                        onClick={() => {
                          onDetachInstance?.();
                        }}
                      >
                        确认分离
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {selection.tag.toLowerCase() === "image" && (
              <ImageCard
                selection={selection}
                disabled={disabled}
                onSetStyle={onSetStyle}
              />
            )}

            {selection.tag.toLowerCase() === "boolean" && (
              <BooleanCard
                selection={selection}
                disabled={disabled}
                onSetStyle={onSetStyle}
                onFlattenSelection={onFlattenSelection}
              />
            )}
            <div className="properties-section flex flex-col gap-1.5">
              <Label
                className="field-label text-[11px] text-muted-foreground"
                htmlFor="properties-name"
              >
                名称
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="properties-name"
                  type="text"
                  className="field-input h-7 text-xs flex-1"
                  aria-label="名称"
                  value={name}
                  disabled={disabled}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={handleNameKeyDown}
                />
                <div className="properties-toggles flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="toolbar-button size-7"
                    aria-label="切换显隐"
                    title="切换显隐"
                    disabled={disabled}
                    onClick={onToggleHidden}
                  >
                    <EyeIcon data-icon="inline-start" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="toolbar-button size-7"
                    aria-label="切换锁定"
                    title="切换锁定"
                    disabled={disabled}
                    onClick={onToggleLocked}
                  >
                    <LockIcon data-icon="inline-start" />
                  </Button>
                </div>
              </div>
            </div>
            {(selection.tag.toLowerCase() === "text" ||
              selection.kind === "text" ||
              (selection.text !== null &&
                selection.text.trim().length > 0)) && (
              <div className="properties-section flex flex-col gap-1.5">
                <Label
                  className="field-label text-[11px] text-muted-foreground"
                  htmlFor="properties-text"
                >
                  文本
                </Label>
                <Textarea
                  id="properties-text"
                  className="field-input field-textarea min-h-[64px] text-xs resize-none"
                  aria-label="文本内容"
                  value={text}
                  disabled={disabled}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={commitText}
                />
              </div>
            )}

            {geometryFields.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground/80 px-1">
                  Geometry 尺寸位置
                </span>
                <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-card/60 p-2">
                  {geometryFields.map((field) => (
                    <GeometryInput key={field.label} field={field} />
                  ))}
                </div>
              </div>
            )}

            {showConstraint && (
              <ConstraintSection
                selection={selection}
                disabled={disabled}
                onSetStyle={onSetStyle}
              />
            )}

            <AutoLayoutSection
              selection={selection}
              disabled={disabled}
              onSetStyle={onSetStyle}
            />
            <ModeSection
              selection={selection}
              tokenModes={tokenModes}
              disabled={disabled}
              onSetAttrs={onSetAttrs}
              onSetStyle={onSetStyle}
            />
            <PrototypeSection
              selection={selection}
              pages={pages}
              disabled={disabled}
              onSetAttrs={onSetAttrs}
              onSetStyle={onSetStyle}
            />
            <Separator className="my-1" />

            {(() => {
              const tag = selection.tag.toLowerCase();
              const isTextNode = tag === "text";
              const isRectOrFrame = tag === "rect" || tag === "frame";

              return (
                <>
                  {isTextNode && (
                    <TypographySection
                      selection={selection}
                      disabled={disabled}
                      onSetStyle={onSetStyle}
                    />
                  )}

                  {isRectOrFrame && (
                    <CornerRadiusControl
                      selection={selection}
                      disabled={disabled}
                      onSetStyle={onSetStyle}
                    />
                  )}
                </>
              );
            })()}

            <Separator className="my-1" />

            <FillSection
              selection={selection}
              disabled={disabled}
              onSetStyle={onSetStyle}
            />

            <StrokeSection
              selection={selection}
              disabled={disabled}
              onSetStyle={onSetStyle}
            />

            <EffectSection
              selection={selection}
              disabled={disabled}
              onSetStyle={onSetStyle}
            />

            <Separator className="my-1" />

            <Separator className="my-1" />

            <div className="properties-section flex flex-col gap-2">
              {(() => {
                const tag = selection.tag.toLowerCase();
                const isShape = [
                  "rect",
                  "ellipse",
                  "star",
                  "vector",
                  "boolean",
                  "path",
                ].includes(tag);
                const appearanceGroup = styleGroups.find(
                  (g) => g.name === "Appearance 外观",
                );
                const otherGroups = styleGroups.filter(
                  (g) => g.name !== "Appearance 外观",
                );
                return (
                  <>
                    {otherGroups.length === 0 &&
                    !isShape &&
                    !appearanceGroup ? (
                      <div className="p-2 text-center text-[11px] text-muted-foreground border border-dashed border-border rounded-md">
                        无样式属性
                      </div>
                    ) : (
                      <>
                        {otherGroups.map((group) => {
                          const isCollapsed = collapsedGroups.has(group.name);
                          return (
                            <div
                              key={group.name}
                              className="flex flex-col gap-1"
                            >
                              <button
                                type="button"
                                onClick={() => toggleGroup(group.name)}
                                className="flex items-center gap-1 px-1 text-[10px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors cursor-pointer select-none"
                                aria-expanded={!isCollapsed}
                              >
                                {isCollapsed ? (
                                  <ChevronRightIcon className="size-2.5" />
                                ) : (
                                  <ChevronDownIcon className="size-2.5" />
                                )}
                                {group.name}
                                <span className="font-mono text-[9px] text-muted-foreground/50">
                                  {group.rows.length}
                                </span>
                              </button>
                              {!isCollapsed && (
                                <div className="style-table flex flex-col divide-y divide-border/40 rounded-md border border-border bg-card/60">
                                  {group.rows.map((row) => (
                                    <StyleValueInput
                                      key={`${row.source}-${row.key}-${row.sourceId ?? ""}`}
                                      row={row}
                                      disabled={disabled}
                                      tokens={tokens}
                                      onCommit={(key, raw, target) =>
                                        onSetStyle(
                                          key,
                                          parseStyleInput(key, raw),
                                          target,
                                        )
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {(isShape || appearanceGroup) && (
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => toggleGroup("Appearance 外观")}
                              className="flex items-center gap-1 px-1 text-[10px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors cursor-pointer select-none"
                              aria-expanded={
                                !collapsedGroups.has("Appearance 外观")
                              }
                            >
                              {collapsedGroups.has("Appearance 外观") ? (
                                <ChevronRightIcon className="size-2.5" />
                              ) : (
                                <ChevronDownIcon className="size-2.5" />
                              )}
                              Appearance 外观
                              <span className="font-mono text-[9px] text-muted-foreground/50">
                                {appearanceGroup?.rows.length ?? 0}
                              </span>
                            </button>
                            {!collapsedGroups.has("Appearance 外观") && (
                              <div className="style-table flex flex-col divide-y divide-border/40 rounded-md border border-border bg-card/60">
                                {(appearanceGroup?.rows ?? []).map((row) => (
                                  <StyleValueInput
                                    key={`${row.source}-${row.key}-${row.sourceId ?? ""}`}
                                    row={row}
                                    disabled={disabled}
                                    tokens={tokens}
                                    onCommit={(key, raw, target) =>
                                      onSetStyle(
                                        key,
                                        parseStyleInput(key, raw),
                                        target,
                                      )
                                    }
                                  />
                                ))}
                                {isShape && !disabled && (
                                  <div className="flex flex-wrap gap-1 p-1.5">
                                    {!selection.styles.some(
                                      (s) => s.key === "opacity",
                                    ) && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        className="h-5 text-[10px] px-2"
                                        onClick={() => onSetStyle("opacity", 1)}
                                      >
                                        + Opacity
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            {selection && (
              <ExportSection
                targetName={selection.name || selection.tag}
                persistedRaw={
                  selection.attrs.find((a) => a.key === "data-export")?.value
                }
                disabled={disabled}
                onSetAttrs={onSetAttrs}
                onExportNode={onExportNode}
              />
            )}
          </div>
        </ScrollArea>
      </section>
    </TooltipProvider>
  );
}
