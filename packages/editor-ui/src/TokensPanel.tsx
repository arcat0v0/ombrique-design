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
import type { TokenItem, TokenModeItem } from "./types";

export interface TokensPanelProps {
  tokens?: TokenItem[];
  modes?: TokenModeItem[];
  onRefreshToken?: () => void;
  onSetToken?: (name: string, value: string, mode?: string) => void;
  onCreateToken?: (name: string, value: string) => void;
  onSelectToken?: (token: TokenItem) => void;
  onAddMode?: (name: string) => void;
  onRenameMode?: (name: string, newName: string) => void;
  onDeleteMode?: (name: string) => void;
}

const LEGACY_MODES: TokenModeItem[] = [{ name: "default", isDefault: true }];

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

function explicitValue(
  token: TokenItem,
  mode: TokenModeItem,
  legacy: boolean,
): string | undefined {
  if (legacy) return token.value;
  return (
    token.values?.[mode.name] ?? (mode.isDefault ? token.value : undefined)
  );
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
  const columns = modes && modes.length > 0 ? modes : LEGACY_MODES;
  const legacy = columns === LEGACY_MODES;
  const defaultMode = columns.find((m) => m.isDefault) ?? columns[0];
  const defaultModeName = defaultMode?.name ?? "default";

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
        t.category?.toLowerCase().includes(q),
    );
  }, [tokens, search]);

  const addModeError = newModeName.trim()
    ? validateModeName(newModeName, columns)
    : null;
  const renameError =
    renamingMode === null
      ? null
      : validateModeName(renameValue, columns, renamingMode);
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
    if (!onAddMode || validateModeName(newModeName, columns)) return;
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

  const commitCell = (token: TokenItem, mode: TokenModeItem, val: string) => {
    if (!onSetToken) return;
    if (legacy) {
      onSetToken(token.name, val);
    } else {
      onSetToken(token.name, val, mode.name);
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
                  {columns.map((mode) => (
                    <th
                      key={mode.name}
                      scope="col"
                      className="h-7 min-w-24 border-b border-border px-1 text-left text-[10px] font-medium text-muted-foreground"
                      data-mode={mode.name}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate" title={mode.name}>
                          {mode.name}
                        </span>
                        {mode.isDefault && (
                          <Badge
                            variant="secondary"
                            className="h-4 px-1 text-[9px]"
                          >
                            默认
                          </Badge>
                        )}
                        {!legacy && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="ml-auto size-5 text-muted-foreground"
                                aria-label={`模式 ${mode.name} 选项`}
                              >
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  disabled={!onRenameMode}
                                  onSelect={() => startRename(mode)}
                                >
                                  <PencilIcon data-icon="inline-start" />
                                  <span>重命名</span>
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                              {!mode.isDefault && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuGroup>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      disabled={!onDeleteMode}
                                      onSelect={() =>
                                        setDeletingMode(mode.name)
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
                  ))}
                  <th scope="col" className="w-6 border-b border-border">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTokens.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 2}
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
                      {columns.map((mode) => {
                        const explicit = explicitValue(token, mode, legacy);
                        return (
                          <td
                            key={mode.name}
                            className="border-b border-border/50 px-1 py-1"
                          >
                            <TokenValueCell
                              key={`${mode.name}:${explicit ?? ""}`}
                              tokenName={token.name}
                              modeName={mode.name}
                              legacy={legacy}
                              explicit={explicit}
                              fallback={token.value}
                              defaultModeName={defaultModeName}
                              canEdit={Boolean(onSetToken)}
                              onCommit={(val) => commitCell(token, mode, val)}
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
  modeName: string;
  legacy: boolean;
  explicit: string | undefined;
  fallback: string;
  defaultModeName: string;
  canEdit: boolean;
  onCommit: (val: string) => void;
}

function TokenValueCell({
  tokenName,
  modeName,
  legacy,
  explicit,
  fallback,
  defaultModeName,
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

  const inheritedText = `继承自默认模式 ${defaultModeName}：${fallback}`;
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
            : `变量 ${tokenName} 在模式 ${modeName} 的值`
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
