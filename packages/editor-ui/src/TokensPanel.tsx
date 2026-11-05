import {
  CheckIcon,
  CoinsIcon,
  CopyIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useId,
  useMemo,
  useState,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TokenAxisSelector, TokenItem, TokenModeItem } from "./types";
import {
  DEFAULT_TOKEN_AXIS,
  DEFAULT_TOKEN_VALUE,
  TOKEN_CELL_PREFIX,
} from "./types";

export interface TokensPanelProps {
  tokens?: TokenItem[];
  modes?: TokenModeItem[];
  onRefreshToken?: () => void;
  onSetToken?: (
    name: string,
    value: string,
    axis?: string,
    axisValue?: string,
    selectors?: TokenAxisSelector[],
  ) => void;
  onCreateToken?: (name: string, value: string) => void;
  onSelectToken?: (token: TokenItem) => void;
  onAddMode?: (name: string) => void;
  onRenameMode?: (name: string, newName: string) => void;
  onDeleteMode?: (name: string) => void;
}

const LEGACY_MODES: TokenModeItem[] = [{ name: "default", isDefault: true }];

interface TokenColumn {
  key: string;
  axis: string;
  axisValue: string;
  label: string;
  isDefault: boolean;
  selectors: TokenAxisSelector[];
  mode?: TokenModeItem;
}

function isColorValue(val: string): boolean {
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("rgb(") ||
    trimmed.startsWith("rgba(") ||
    trimmed.startsWith("hsl(") ||
    trimmed.startsWith("hsla(")
  );
}

function validateModeName(
  name: string,
  modes: TokenModeItem[],
  current?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "模式名称不能为空";
  if (/["\\]/.test(trimmed)) return "模式名称不能包含引号或反斜杠";
  if (trimmed !== current && modes.some((m) => m.name === trimmed)) {
    return "已存在同名模式";
  }
  return null;
}

function selectorKey(selectors: TokenAxisSelector[]): string {
  return selectors
    .map((selector) => `${selector.axis}\u0000${selector.value}`)
    .sort()
    .join("\u0001");
}

function escapeCellPart(part: string): string {
  let out = "";
  for (const char of part) {
    if (/[a-zA-Z0-9]/.test(char)) {
      out += char;
    } else {
      out += `-${(char.codePointAt(0) ?? 0).toString(16)}-`;
    }
  }
  return out;
}

export function encodeTokenCellRef(selectors: TokenAxisSelector[]): string {
  if (selectors.length === 0) return `${TOKEN_CELL_PREFIX} root`;
  return [
    TOKEN_CELL_PREFIX,
    ...selectors.map(
      (selector) =>
        `${escapeCellPart(selector.axis)}---${escapeCellPart(selector.value)}`,
    ),
  ].join(" ");
}

function explicitValue(
  token: TokenItem,
  column: TokenColumn,
  legacy: boolean,
): string | undefined {
  if (legacy) return token.value;
  if (token.cells) {
    const cells = token.cells.filter(
      (cell) =>
        cell.isDefault === column.isDefault &&
        selectorKey(cell.selectors) === selectorKey(column.selectors),
    );
    return cells.at(-1)?.value;
  }
  if (column.isDefault) return token.value;
  return (
    token.values?.[column.axisValue] ??
    (column.mode?.isDefault ? token.value : undefined)
  );
}

function buildColumnsFromCells(
  tokens: TokenItem[],
  modes?: TokenModeItem[],
): TokenColumn[] {
  const columns = new Map<string, TokenColumn>();
  const defaultMode = modes?.find((item) => item.isDefault);
  columns.set("default", {
    key: "default",
    axis: DEFAULT_TOKEN_AXIS,
    axisValue: DEFAULT_TOKEN_VALUE,
    label: DEFAULT_TOKEN_VALUE,
    isDefault: true,
    selectors: [],
    mode: defaultMode,
  });
  for (const token of tokens) {
    for (const cell of token.cells ?? []) {
      if (cell.isDefault && cell.selectors.length === 0) continue;
      const sorted = [...cell.selectors].sort((a, b) =>
        `${a.axis}\u0000${a.value}`.localeCompare(`${b.axis}\u0000${b.value}`),
      );
      const axis = sorted.map((selector) => selector.axis).join("+");
      const axisValue = sorted.map((selector) => selector.value).join("+");
      const key = `${selectorKey(sorted)}:${axis}:${axisValue}`;
      if (columns.has(key)) continue;
      const mode =
        sorted.length === 1 && sorted[0]?.axis === "mode"
          ? modes?.find((item) => item.name === sorted[0]?.value)
          : undefined;
      columns.set(key, {
        key,
        axis,
        axisValue,
        label: axisValue,
        isDefault: false,
        selectors: sorted,
        mode,
      });
    }
  }
  if (modes) {
    for (const mode of modes) {
      if (mode.isDefault) continue;
      const selectors = [{ axis: "mode", value: mode.name }];
      const key = `${selectorKey(selectors)}:mode:${mode.name}`;
      if (columns.has(key)) continue;
      columns.set(key, {
        key,
        axis: "mode",
        axisValue: mode.name,
        label: mode.name,
        isDefault: false,
        selectors,
        mode,
      });
    }
  }
  const result = [...columns.values()];
  result.sort((a, b) => {
    const rankA = a.isDefault ? 0 : a.selectors.length;
    const rankB = b.isDefault ? 0 : b.selectors.length;
    return (
      rankA - rankB ||
      a.axis.localeCompare(b.axis) ||
      a.axisValue.localeCompare(b.axisValue)
    );
  });
  return result;
}

function buildColumnsFromModes(modeItems: TokenModeItem[]): TokenColumn[] {
  const columns = modeItems.map((mode) => ({
    key: `mode:${mode.name}`,
    axis: "mode",
    axisValue: mode.name,
    label: mode.name,
    isDefault: mode.isDefault,
    selectors: mode.isDefault ? [] : [{ axis: "mode", value: mode.name }],
    mode,
  }));
  return columns;
}

export function TokensPanel({
  tokens = [],
  modes,
  onRefreshToken,
  onSetToken,
  onCreateToken,
  onSelectToken,
  onAddMode,
  onRenameMode,
  onDeleteMode,
}: TokensPanelProps) {
  const modeItems = modes && modes.length > 0 ? modes : LEGACY_MODES;
  const hasCells = tokens.some((token) => (token.cells?.length ?? 0) > 0);
  const legacy = !hasCells && (!modes || modes.length === 0);
  const tokenColumns = useMemo(
    () =>
      hasCells
        ? buildColumnsFromCells(tokens, modes)
        : buildColumnsFromModes(modeItems),
    [tokens, modes, modeItems, hasCells],
  );
  const defaultColumn =
    tokenColumns.find((column) => column.isDefault) ?? tokenColumns[0];
  const defaultColumnLabel = defaultColumn?.label ?? "default";

  const [search, setSearch] = useState("");
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addModeOpen, setAddModeOpen] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [renamingMode, setRenamingMode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingMode, setDeletingMode] = useState<string | null>(null);
  const addModeInputId = useId();
  const renameModeInputId = useId();

  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        Object.values(t.values ?? {}).some((v) =>
          v.toLowerCase().includes(q),
        ) ||
        (t.cells ?? []).some((cell) => cell.value.toLowerCase().includes(q)) ||
        t.category?.toLowerCase().includes(q),
    );
  }, [tokens, search]);

  const addModeError = newModeName.trim()
    ? validateModeName(newModeName, modeItems)
    : null;
  const renameError =
    renamingMode === null
      ? null
      : validateModeName(renameValue, modeItems, renamingMode);
  const renameUnchanged = renameValue.trim() === renamingMode;

  const handleCopy = (token: TokenItem) => {
    const varText = `var(${token.name})`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(varText);
    }
    setCopiedName(token.name);
    setTimeout(() => {
      setCopiedName(null);
    }, 1500);
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!onCreateToken) return;
    const trimmedName = newName.trim();
    const formattedName = trimmedName.startsWith("--")
      ? trimmedName
      : `--${trimmedName}`;
    const trimmedValue = newValue.trim();
    if (!formattedName || !trimmedValue) return;

    onCreateToken(formattedName, trimmedValue);
    onRefreshToken?.();
    setNewName("");
    setNewValue("");
    setCreateOpen(false);
  };

  const handleAddModeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!onAddMode || validateModeName(newModeName, modeItems)) return;
    onAddMode(newModeName.trim());
    onRefreshToken?.();
    setNewModeName("");
    setAddModeOpen(false);
  };

  const handleRenameSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!onRenameMode || renamingMode === null) return;
    if (renameError || renameUnchanged) return;
    onRenameMode(renamingMode, renameValue.trim());
    onRefreshToken?.();
    setRenamingMode(null);
  };

  const startRename = (mode: TokenModeItem) => {
    setRenameValue(mode.name);
    setRenamingMode(mode.name);
  };

  const confirmDelete = () => {
    if (!onDeleteMode || deletingMode === null) return;
    onDeleteMode(deletingMode);
    onRefreshToken?.();
    setDeletingMode(null);
  };

  const commitCell = (token: TokenItem, column: TokenColumn, val: string) => {
    if (!onSetToken) return;
    if (legacy) {
      onSetToken(token.name, val);
    } else {
      onSetToken(
        token.name,
        val,
        column.axis,
        column.axisValue,
        column.selectors,
      );
    }
    onRefreshToken?.();
  };

  return (
    <TooltipProvider delayDuration={200}>
      <section
        className="tokens-panel flex flex-1 flex-col min-h-0 bg-card/40"
        aria-label="设计变量面板"
      >
        <div className="panel-heading flex h-8 items-center justify-between border-b border-border px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
          <div className="flex items-center gap-1.5">
            <CoinsIcon className="size-3.5 text-primary/70" />
            <span>设计变量</span>
            {tokens.length > 0 && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[10px] font-mono"
              >
                {tokens.length}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {onRefreshToken && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label="刷新变量"
                    onClick={onRefreshToken}
                  >
                    <RefreshCwIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">刷新变量列表</TooltipContent>
              </Tooltip>
            )}

            <Dialog
              open={addModeOpen}
              onOpenChange={(open) => {
                setAddModeOpen(open);
                if (!open) setNewModeName("");
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label="新建模式"
                        disabled={!onAddMode}
                      >
                        <LayersIcon />
                      </Button>
                    </DialogTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {onAddMode ? "新建变量模式" : "核心尚未接线 addTokenMode"}
                </TooltipContent>
              </Tooltip>

              <DialogContent position="left-panel">
                <DialogHeader>
                  <DialogTitle>新建模式</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={handleAddModeSubmit}
                  className="flex flex-col gap-3"
                >
                  <FieldGroup className="gap-3">
                    <Field data-invalid={addModeError ? true : undefined}>
                      <FieldLabel htmlFor={addModeInputId} className="text-xs">
                        模式名称
                      </FieldLabel>
                      <Input
                        id={addModeInputId}
                        placeholder="Dark"
                        value={newModeName}
                        onChange={(e) => setNewModeName(e.target.value)}
                        aria-invalid={addModeError ? true : undefined}
                        className="h-8 text-xs"
                        autoFocus
                      />
                      <FieldError className="text-xs">
                        {addModeError}
                      </FieldError>
                    </Field>
                  </FieldGroup>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddModeOpen(false)}
                    >
                      取消
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newModeName.trim() || Boolean(addModeError)}
                    >
                      添加
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label="新建变量"
                        disabled={!onCreateToken}
                      >
                        <PlusIcon />
                      </Button>
                    </DialogTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {onCreateToken ? "新建设计变量" : "核心尚未接线 createToken"}
                </TooltipContent>
              </Tooltip>

              <DialogContent position="left-panel">
                <DialogHeader>
                  <DialogTitle>新建设计变量</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={handleCreateSubmit}
                  className="flex flex-col gap-3 py-2"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="token-name" className="text-xs">
                      变量名称
                    </Label>
                    <Input
                      id="token-name"
                      placeholder="--color-brand 或 color-brand"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-8 font-mono text-xs"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="token-value" className="text-xs">
                      变量值
                    </Label>
                    <Input
                      id="token-value"
                      placeholder="#3b82f6 或 16px"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <DialogFooter className="mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateOpen(false)}
                    >
                      取消
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newName.trim() || !newValue.trim()}
                    >
                      创建
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="p-2 pb-1.5">
          <div className="relative flex items-center">
            <SearchIcon className="absolute left-2 size-3 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索变量名或值..."
              className="h-6 pl-6 pr-6 text-[11px] bg-background/50"
              aria-label="搜索设计变量"
            />
            {search && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 size-4 p-0 text-muted-foreground"
                onClick={() => setSearch("")}
                aria-label="清除搜索"
              >
                <XIcon className="size-2.5" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 w-full overflow-hidden">
          <div className="overflow-x-auto px-2 pb-2">
            <table
              className="w-full border-separate border-spacing-0 text-xs"
              aria-label="设计变量表"
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 h-7 min-w-28 border-b border-border bg-card px-1.5 text-left text-[10px] font-medium text-muted-foreground"
                  >
                    变量
                  </th>
                  {tokenColumns.map((column) => {
                    const modeItem = column.mode;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        className="h-7 min-w-24 border-b border-border px-1 text-left text-[10px] font-medium text-muted-foreground"
                        data-axis={column.axis}
                        data-axis-value={column.axisValue}
                      >
                        <div className="flex items-center gap-1">
                          <div className="flex min-w-0 flex-col">
                            <span className="text-[9px] text-muted-foreground/70">
                              {column.axis}
                            </span>
                            <span className="truncate" title={column.label}>
                              {column.label}
                            </span>
                          </div>
                          {column.isDefault && (
                            <Badge
                              variant="secondary"
                              className="h-4 px-1 text-[9px]"
                            >
                              默认
                            </Badge>
                          )}
                          {!legacy && modeItem && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  className="ml-auto size-5 text-muted-foreground"
                                  aria-label={`轴 ${column.axis} 值 ${column.axisValue} 选项`}
                                >
                                  <MoreHorizontalIcon />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-32">
                                <DropdownMenuGroup>
                                  <DropdownMenuItem
                                    disabled={!onRenameMode}
                                    onSelect={() => startRename(modeItem)}
                                  >
                                    <PencilIcon data-icon="inline-start" />
                                    <span>重命名</span>
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                                {!modeItem.isDefault && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                      <DropdownMenuItem
                                        variant="destructive"
                                        disabled={!onDeleteMode}
                                        onSelect={() =>
                                          setDeletingMode(modeItem.name)
                                        }
                                      >
                                        <Trash2Icon data-icon="inline-start" />
                                        <span>删除</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th scope="col" className="w-6 border-b border-border">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTokens.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tokenColumns.length + 2}
                      className="p-4 text-center text-xs text-muted-foreground"
                    >
                      {search
                        ? "未找到匹配的设计变量"
                        : tokens.length === 0
                          ? "暂无设计变量（tokens.css）"
                          : "暂无匹配变量"}
                    </td>
                  </tr>
                ) : (
                  filteredTokens.map((token) => (
                    <tr
                      key={token.name}
                      className="token-row group hover:bg-muted/50"
                      data-testid={`token-row-${token.name}`}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 border-b border-border/50 bg-card px-1.5 py-1 text-left font-normal"
                      >
                        {onSelectToken ? (
                          <button
                            type="button"
                            onClick={() => onSelectToken(token)}
                            className="flex w-full min-w-0 cursor-pointer text-left"
                          >
                            <span
                              className="token-name truncate font-mono text-[11px] font-medium text-foreground"
                              title={token.name}
                            >
                              {token.name}
                            </span>
                          </button>
                        ) : (
                          <span
                            className="token-name block truncate font-mono text-[11px] font-medium text-foreground"
                            title={token.name}
                          >
                            {token.name}
                          </span>
                        )}
                      </th>
                      {tokenColumns.map((column) => {
                        const explicit = explicitValue(token, column, legacy);
                        const columnLabel = `${column.axis} / ${column.axisValue}`;
                        return (
                          <td
                            key={column.key}
                            className="border-b border-border/50 px-1 py-1"
                          >
                            <TokenValueCell
                              key={`${column.key}:${explicit ?? ""}`}
                              tokenName={token.name}
                              columnLabel={columnLabel}
                              legacy={legacy}
                              explicit={explicit}
                              fallback={token.value}
                              defaultColumnLabel={defaultColumnLabel}
                              canEdit={Boolean(onSetToken)}
                              onCommit={(val) => commitCell(token, column, val)}
                            />
                          </td>
                        );
                      })}
                      <td className="border-b border-border/50 py-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="size-5 text-muted-foreground"
                              aria-label={`复制变量名 ${token.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(token);
                              }}
                            >
                              {copiedName === token.name ? (
                                <CheckIcon />
                              ) : (
                                <CopyIcon />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {copiedName === token.name
                              ? "已复制变量引用"
                              : `复制 var(${token.name})`}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ScrollArea>

        <Dialog
          open={renamingMode !== null}
          onOpenChange={(open) => {
            if (!open) setRenamingMode(null);
          }}
        >
          <DialogContent position="left-panel">
            <DialogHeader>
              <DialogTitle>重命名模式</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRenameSubmit} className="flex flex-col gap-3">
              <FieldGroup className="gap-3">
                <Field data-invalid={renameError ? true : undefined}>
                  <FieldLabel htmlFor={renameModeInputId} className="text-xs">
                    模式名称
                  </FieldLabel>
                  <Input
                    id={renameModeInputId}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    aria-invalid={renameError ? true : undefined}
                    className="h-8 text-xs"
                    autoFocus
                  />
                  <FieldError className="text-xs">{renameError}</FieldError>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenamingMode(null)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={Boolean(renameError) || renameUnchanged}
                >
                  保存
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={deletingMode !== null}
          onOpenChange={(open) => {
            if (!open) setDeletingMode(null);
          }}
        >
          <AlertDialogContent position="left-panel">
            <AlertDialogHeader>
              <AlertDialogTitle>删除模式</AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                {`确定要删除模式 "${deletingMode ?? ""}" 吗？该模式下的显式变量值将被移除。`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm">取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                size="sm"
                onClick={confirmDelete}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </TooltipProvider>
  );
}

interface TokenValueCellProps {
  tokenName: string;
  columnLabel: string;
  legacy: boolean;
  explicit: string | undefined;
  fallback: string;
  defaultColumnLabel: string;
  canEdit: boolean;
  onCommit: (val: string) => void;
}

function TokenValueCell({
  tokenName,
  columnLabel,
  legacy,
  explicit,
  fallback,
  defaultColumnLabel,
  canEdit,
  onCommit,
}: TokenValueCellProps) {
  const [val, setVal] = useState(explicit ?? "");
  const descriptionId = useId();
  const inherited = explicit === undefined;
  const effective = inherited ? fallback : explicit;
  const swatchValue = val.trim() || effective;

  const commit = () => {
    const trimmed = val.trim();
    if (!trimmed) {
      setVal(explicit ?? "");
      return;
    }
    if (trimmed === explicit) return;
    onCommit(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setVal(explicit ?? "");
      e.currentTarget.blur();
    }
  };

  const inheritedText = `继承自默认轴值 ${defaultColumnLabel}：${fallback}`;
  const title = !canEdit
    ? "核心尚未接线 setToken"
    : inherited
      ? `${inheritedText}，输入值以覆盖`
      : "点击修改变量值并按 Enter 提交";

  return (
    <div className="flex items-center gap-1">
      {isColorValue(swatchValue) && (
        <span
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 rounded-xs border border-border",
            inherited && !val.trim() && "opacity-50",
          )}
          style={{ backgroundColor: swatchValue }}
        />
      )}
      <Input
        type="text"
        value={val}
        placeholder={inherited ? fallback : undefined}
        disabled={!canEdit}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        title={title}
        aria-label={
          legacy
            ? `变量 ${tokenName} 的值`
            : `变量 ${tokenName} 在轴 ${columnLabel} 的值`
        }
        aria-describedby={inherited ? descriptionId : undefined}
        data-inherited={inherited ? "true" : undefined}
        className={cn(
          "h-6 min-w-20 px-1 font-mono text-[10px] md:text-[10px] border-transparent bg-transparent hover:border-input focus-visible:bg-background",
          inherited && "italic",
        )}
      />
      {inherited && (
        <span id={descriptionId} className="sr-only">
          {inheritedText}
        </span>
      )}
    </div>
  );
}
