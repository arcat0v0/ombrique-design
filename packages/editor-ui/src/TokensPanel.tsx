import {
  CheckIcon,
  CoinsIcon,
  CopyIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
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
import type { TokenItem } from "./types";

export interface TokensPanelProps {
  tokens?: TokenItem[];
  onRefreshToken?: () => void;
  onSetToken?: (name: string, value: string) => void;
  onCreateToken?: (name: string, value: string) => void;
  onSelectToken?: (token: TokenItem) => void;
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

export function TokensPanel({
  tokens = [],
  onRefreshToken,
  onSetToken,
  onCreateToken,
  onSelectToken,
}: TokensPanelProps) {
  const [search, setSearch] = useState("");
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");

  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q),
    );
  }, [tokens, search]);

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

  const handleCreateSubmit = (e: React.FormEvent) => {
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
                    className="size-6 text-muted-foreground hover:text-foreground"
                    aria-label="刷新变量"
                    onClick={onRefreshToken}
                  >
                    <RefreshCwIcon className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">刷新变量列表</TooltipContent>
              </Tooltip>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        aria-label="新建变量"
                        disabled={!onCreateToken}
                      >
                        <PlusIcon className="size-3.5" />
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
                className="absolute right-1 size-4 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
                aria-label="清除搜索"
              >
                <XIcon className="size-2.5" />
              </Button>
            )}
          </div>
        </div>

        {filteredTokens.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {search
              ? "未找到匹配的设计变量"
              : tokens.length === 0
                ? "暂无设计变量（tokens.css）"
                : "暂无匹配变量"}
          </div>
        ) : (
          <ScrollArea className="flex-1 w-full overflow-hidden">
            <div className="flex flex-col gap-1 p-2">
              {filteredTokens.map((token) => (
                <TokenRowItem
                  key={token.name}
                  token={token}
                  isCopied={copiedName === token.name}
                  onCopy={() => handleCopy(token)}
                  onCommitValue={(val) => {
                    onSetToken?.(token.name, val);
                    onRefreshToken?.();
                  }}
                  onSelect={() => onSelectToken?.(token)}
                  canEdit={Boolean(onSetToken)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </section>
    </TooltipProvider>
  );
}

interface TokenRowItemProps {
  token: TokenItem;
  isCopied: boolean;
  canEdit: boolean;
  onCopy: () => void;
  onCommitValue: (val: string) => void;
  onSelect?: () => void;
}

function TokenRowItem({
  token,
  isCopied,
  canEdit,
  onCopy,
  onCommitValue,
  onSelect,
}: TokenRowItemProps) {
  const [val, setVal] = useState(token.value);
  const isColor = isColorValue(token.value);

  const commit = () => {
    const trimmed = val.trim();
    if (trimmed === token.value) return;
    onCommitValue(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setVal(token.value);
      e.currentTarget.blur();
    }
  };

  return (
    <div
      className="token-row group flex items-center justify-between gap-1.5 rounded-md border border-border/50 bg-background/50 px-2 py-1 text-xs hover:border-border hover:bg-background transition-colors"
      data-testid={`token-row-${token.name}`}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
        >
          {isColor ? (
            <span
              className="size-3.5 shrink-0 rounded-xs border border-border shadow-2xs"
              style={{ backgroundColor: token.value }}
              title={token.value}
            />
          ) : (
            <span className="size-3.5 shrink-0 rounded-xs border border-border/40 bg-muted/50 flex items-center justify-center text-[9px] font-mono text-muted-foreground">
              #
            </span>
          )}
          <span
            className="token-name font-mono text-[11px] font-medium text-foreground truncate min-w-0 flex-1"
            title={token.name}
          >
            {token.name}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isColor ? (
            <span
              className="size-3.5 shrink-0 rounded-xs border border-border shadow-2xs"
              style={{ backgroundColor: token.value }}
              title={token.value}
            />
          ) : (
            <span className="size-3.5 shrink-0 rounded-xs border border-border/40 bg-muted/50 flex items-center justify-center text-[9px] font-mono text-muted-foreground">
              #
            </span>
          )}
          <span
            className="token-name font-mono text-[11px] font-medium text-foreground truncate min-w-0 flex-1"
            title={token.name}
          >
            {token.name}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="text"
          value={val}
          disabled={!canEdit}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          title={
            canEdit ? "点击修改变量值并按 Enter 提交" : "核心尚未接线 setToken"
          }
          aria-label={`变量 ${token.name} 的值`}
          className={cn(
            "h-5 w-20 px-1 font-mono text-[10px] text-right bg-transparent border-transparent hover:border-input focus:border-input focus:bg-background",
            !canEdit && "opacity-60 cursor-not-allowed",
          )}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 p-0 text-muted-foreground hover:text-foreground"
              aria-label={`复制变量名 ${token.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
            >
              {isCopied ? (
                <CheckIcon className="size-3 text-emerald-500" />
              ) : (
                <CopyIcon className="size-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {isCopied ? "已复制变量引用" : `复制 var(${token.name})`}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
