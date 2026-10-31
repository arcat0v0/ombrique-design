import {
  ChevronDownIcon,
  DownloadIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  createExportSettingId,
  formatScaleLabel,
  parseExportSettings,
  parseScaleInput,
  serializeExportSettings,
  type ExportFormat,
  type ExportSetting,
} from "@ombrique/protocol";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ExportSectionProps {
  targetName: string;
  isBoard?: boolean;
  persistedRaw?: string | null;
  disabled?: boolean;
  onSetAttrs?: (
    attrs: Record<string, string | number | boolean | null>,
  ) => void;
  onExportNode?: (
    formatOrSettings: "png" | "jpg" | "webp" | "svg" | "pdf" | ExportSetting[],
    scale?: number,
  ) => Promise<boolean> | undefined;
}

const SCALE_PRESETS = ["0.5x", "1x", "2x", "3x", "4x", "512w", "1024w"];
const FORMAT_OPTIONS: ExportFormat[] = ["png", "jpg", "svg", "pdf", "webp"];

export function ExportSection({
  targetName,
  isBoard = false,
  persistedRaw,
  disabled = false,
  onSetAttrs,
  onExportNode,
}: ExportSectionProps) {
  const [rows, setRows] = useState<ExportSetting[]>(() => {
    const parsed = parseExportSettings(persistedRaw);
    if (parsed.length > 0) return parsed;
    return [
      {
        id: createExportSettingId(),
        format: "png",
        scale: { type: "scale", value: 1 },
        suffix: "",
      },
    ];
  });

  useEffect(() => {
    if (persistedRaw !== undefined) {
      const parsed = parseExportSettings(persistedRaw);
      if (parsed.length > 0) {
        setRows(parsed);
      }
    }
  }, [persistedRaw]);

  const commitRows = (nextRows: ExportSetting[]) => {
    setRows(nextRows);
    if (!isBoard && onSetAttrs) {
      const serialized = serializeExportSettings(nextRows);
      onSetAttrs({ "data-export": serialized || null });
    }
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    const newScale =
      last && last.scale.type === "scale" && last.scale.value === 1
        ? { type: "scale" as const, value: 2 }
        : { type: "scale" as const, value: 1 };
    const newSuffix =
      newScale.type === "scale" && newScale.value === 2 ? "@2x" : "";
    const next: ExportSetting[] = [
      ...rows,
      {
        id: createExportSettingId(),
        format: last?.format ?? "png",
        scale: newScale,
        suffix: newSuffix,
      },
    ];
    commitRows(next);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      const resetRow: ExportSetting[] = [
        {
          id: createExportSettingId(),
          format: "png",
          scale: { type: "scale", value: 1 },
          suffix: "",
        },
      ];
      commitRows(resetRow);
      return;
    }
    const next = rows.filter((r) => r.id !== id);
    commitRows(next);
  };

  const updateRow = (id: string, patch: Partial<ExportSetting>) => {
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    commitRows(next);
  };

  const handleExport = () => {
    if (!onExportNode || disabled) return;
    void onExportNode(rows);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="export-section flex flex-col gap-2 rounded-md border border-border bg-card/60 p-2.5 mt-1"
        data-testid="export-section"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DownloadIcon className="size-3.5 text-primary shrink-0" />
            <span className="font-semibold text-xs text-foreground">
              导出 Export
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="size-6 p-0 text-muted-foreground hover:text-foreground"
                disabled={disabled}
                onClick={addRow}
                aria-label="添加导出设置"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">添加导出设置</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                <Input
                  type="text"
                  value={formatScaleLabel(row.scale)}
                  disabled={disabled}
                  onChange={(e) => {
                    const val = e.target.value;
                    const parsed = parseScaleInput(val);
                    updateRow(row.id, { scale: parsed });
                  }}
                  className="h-6 w-12 px-1 text-center font-mono text-[11px]"
                  aria-label="导出倍率"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={disabled}
                      className="h-6 w-4 p-0 text-muted-foreground"
                      aria-label="选择倍率预设"
                    >
                      <ChevronDownIcon className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-20">
                    <DropdownMenuGroup>
                      {SCALE_PRESETS.map((preset) => (
                        <DropdownMenuItem
                          key={preset}
                          onClick={() => {
                            const parsed = parseScaleInput(preset);
                            updateRow(row.id, { scale: parsed });
                          }}
                          className="text-xs font-mono"
                        >
                          {preset}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Input
                type="text"
                value={row.suffix}
                placeholder="后缀"
                disabled={disabled}
                onChange={(e) => {
                  updateRow(row.id, { suffix: e.target.value });
                }}
                className="h-6 w-14 flex-1 px-1.5 font-mono text-[11px]"
                aria-label="导出文件名后缀"
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={disabled}
                    className="h-6 w-14 px-1 font-mono text-[10px] uppercase font-semibold justify-between"
                    aria-label="导出格式"
                  >
                    <span>{row.format}</span>
                    <ChevronDownIcon className="size-2.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-18">
                  <DropdownMenuGroup>
                    {FORMAT_OPTIONS.map((fmt) => (
                      <DropdownMenuItem
                        key={fmt}
                        onClick={() => updateRow(row.id, { format: fmt })}
                        className="text-xs font-mono uppercase"
                      >
                        {fmt}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="size-6 p-0 text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    onClick={() => removeRow(row.id)}
                    aria-label="删除导出设置"
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">删除设置</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>

        <div className="pt-1 border-t border-border/40 flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-full">
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  disabled={disabled || !onExportNode}
                  onClick={handleExport}
                  className="h-7 w-full gap-1.5 text-xs font-normal"
                  aria-label={`导出 ${targetName}`}
                >
                  <DownloadIcon className="size-3.5" />
                  <span>导出 {targetName}</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {onExportNode
                ? `导出 ${targetName} (${rows.length} 个配置)`
                : "核心尚未接线 exportNode"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
