import { useEffect, useMemo, useState } from "react";
import type { RecentProject } from "@ombrique/protocol";
import {
  ArrowUpRightIcon,
  BoxIcon,
  Clock3Icon,
  FolderOpenIcon,
  FolderPlusIcon,
  PackageOpenIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./theme.css";

export interface WorkspaceProps {
  recentProjects?: RecentProject[];
  busy?: boolean;
  notice?: string | null;
  onOpenRecent: (root: string) => void;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onOpenBundle?: () => void;
  onOpenExample?: () => void;
  onRemoveRecent?: (root: string) => void;
  onDismissNotice?: () => void;
}

export function formatRelativeTime(
  value: string,
  now: number = Date.now(),
): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "未知时间";
  const diff = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function accentFor(seed: string): { hue: number; hue2: number } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return { hue: hash, hue2: (hash + 62) % 360 };
}

function ProjectCover({ project }: { project: RecentProject }) {
  const { hue, hue2 } = accentFor(project.root);
  const initials =
    project.name.replace(/\s+/g, "").slice(0, 2).toUpperCase() || "OM";
  if (project.thumbnail) {
    return (
      <img
        src={project.thumbnail}
        alt=""
        draggable={false}
        className="size-full object-cover"
      />
    );
  }
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: `radial-gradient(120% 120% at 14% 10%, hsl(${hue} 62% 24% / 0.9), transparent 62%), radial-gradient(110% 110% at 88% 94%, hsl(${hue2} 58% 20% / 0.85), transparent 58%), #101014`,
      }}
    >
      <div className="absolute left-5 top-4 h-2 w-20 rounded-full bg-white/10" />
      <div className="absolute left-5 top-9 h-1.5 w-11 rounded-full bg-white/[0.06]" />
      <div className="absolute right-4 bottom-4 top-4 w-[42%] rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="absolute left-3 top-3 size-9 rounded-md border border-white/10 bg-white/[0.06]" />
        <div className="absolute left-3 right-3 top-16 h-2 rounded-full bg-white/[0.06]" />
        <div className="absolute left-3 right-9 top-20 h-2 rounded-full bg-white/[0.04]" />
        <div className="absolute bottom-3 left-3 h-6 w-16 rounded-md bg-white/[0.08]" />
      </div>
      <span className="absolute bottom-3 left-4 font-mono text-[26px] font-semibold tracking-tight text-white/[0.08]">
        {initials}
      </span>
    </div>
  );
}

interface RecentCardProps {
  project: RecentProject;
  busy: boolean;
  onOpen: (root: string) => void;
  onRemove?: (root: string) => void;
}

function RecentCard({ project, busy, onOpen, onRemove }: RecentCardProps) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/60 bg-card/50 transition-colors",
        project.exists
          ? "hover:border-primary/35 hover:bg-card/80"
          : "opacity-75 hover:border-destructive/30",
      )}
    >
      <button
        type="button"
        aria-label={`打开项目 ${project.name}`}
        disabled={!project.exists || busy}
        onClick={() => onOpen(project.root)}
        className="absolute inset-0 z-10 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      />
      <div className="relative aspect-[16/10] overflow-hidden border-b border-border/50 bg-[#101014]">
        <ProjectCover project={project} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white/85 backdrop-blur">
            打开项目
          </span>
          <span className="flex size-6 items-center justify-center rounded-full bg-white/90 text-black">
            <ArrowUpRightIcon className="size-3.5" />
          </span>
        </div>
        {!project.exists && (
          <Badge
            variant="destructive"
            className="absolute left-3 top-3 h-5 gap-1 bg-destructive/25 text-[10px] backdrop-blur"
          >
            路径不存在
          </Badge>
        )}
      </div>
      <div className="relative px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">
            {project.name}
          </span>
          {typeof project.pageCount === "number" && project.pageCount > 0 && (
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
              {project.pageCount} 页
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock3Icon className="size-3" />
          <span>{formatRelativeTime(project.lastOpenedAt)}</span>
        </div>
        <div
          className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground/55"
          title={project.root}
        >
          {project.root}
        </div>
      </div>
      {onRemove && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`从最近项目中移除 ${project.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(project.root);
              }}
              className="absolute right-2 top-2 z-20 size-7 rounded-full bg-black/45 text-white/70 opacity-0 backdrop-blur transition hover:bg-black/70 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
            >
              <XIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            从最近中移除（不会删除项目文件）
          </TooltipContent>
        </Tooltip>
      )}
    </article>
  );
}

function QuickLink({
  icon: Icon,
  title,
  description,
  action,
  disabled,
}: {
  icon: typeof FolderOpenIcon;
  title: string;
  description: string;
  action?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={action}
      disabled={disabled || !action}
      className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/30 p-3.5 text-left transition-colors hover:border-border hover:bg-card/60 disabled:cursor-default disabled:hover:border-border/60 disabled:hover:bg-card/30"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

export function Workspace({
  recentProjects,
  busy = false,
  notice,
  onOpenRecent,
  onOpenProject,
  onCreateProject,
  onOpenBundle,
  onOpenExample,
  onRemoveRecent,
  onDismissNotice,
}: WorkspaceProps) {
  const [query, setQuery] = useState("");
  const loading = recentProjects === undefined;
  const projects = recentProjects ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(needle) ||
        project.root.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && query) {
        setQuery("");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        onOpenProject();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        onCreateProject();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCreateProject, onOpenProject, query]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="workspace flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 bg-card/40 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <BoxIcon className="size-3.5" />
            </span>
            <span className="text-[13px] font-semibold tracking-tight">
              Ombrique
            </span>
            <span className="h-4 w-px bg-border" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400/80" />
            <span>本地工作区 · 源码即设计</span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border/70 bg-card/20 px-3 py-4 md:flex">
            <div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
              开始
            </div>
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-lg bg-secondary px-2 text-xs font-medium text-secondary-foreground"
            >
              <Clock3Icon className="size-3.5 text-muted-foreground" />
              <span>最近项目</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {projects.length}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenProject}
              disabled={busy}
              className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            >
              <FolderOpenIcon className="size-3.5" />
              <span>打开本地项目</span>
            </button>
            <button
              type="button"
              onClick={onOpenExample}
              disabled={busy || !onOpenExample}
              className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-default disabled:opacity-40"
            >
              <SparklesIcon className="size-3.5" />
              <span>示例项目</span>
            </button>

            <div className="mt-auto rounded-xl border border-border/60 bg-gradient-to-b from-card/80 to-card/30 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <SparklesIcon className="size-3.5 text-primary/70" />
                <span>设计即代码</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                每个画板都是项目里的真实 TSX 文件，走 Git、可审查、能交给
                agent。
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {["V", "F", "R", "T"].map((key) => (
                  <Kbd
                    key={key}
                    className="h-5 min-w-5 justify-center bg-muted/50 px-1 text-[10px]"
                  >
                    {key}
                  </Kbd>
                ))}
                <span className="ml-1 text-[10px] text-muted-foreground/70">
                  画布工具
                </span>
              </div>
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1120px] px-6 py-7 lg:px-10 lg:py-9">
              {notice && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                  <span className="min-w-0 flex-1 truncate">{notice}</span>
                  {onDismissNotice && (
                    <button
                      type="button"
                      aria-label="关闭通知"
                      onClick={onDismissNotice}
                      className="rounded-md p-1 transition-colors hover:bg-destructive/15"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  )}
                </div>
              )}

              <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/40 px-7 py-7 shadow-[0_24px_70px_-50px_rgba(0,0,0,0.9)] lg:px-9 lg:py-8">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-28 -top-36 size-[440px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,51,102,0.18),transparent_66%)]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-40 -left-24 size-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(96,125,255,0.16),transparent_66%)]"
                />
                <div className="relative max-w-[620px]">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-primary/70">
                    <span className="size-1.5 rounded-full bg-primary/70" />
                    Workspace
                  </div>
                  <h1 className="mt-2.5 text-[28px] font-semibold leading-tight tracking-tight">
                    继续你的设计
                  </h1>
                  <p className="mt-2 max-w-[520px] text-[13px] leading-6 text-muted-foreground">
                    从最近项目接着做，或打开一个新的代码项目。画布之上是真实的
                    React 排版，画布之下是干净的 TSX 源码。
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={onCreateProject}
                      className="h-8 gap-1.5 px-3"
                    >
                      <PlusIcon className="size-3.5" />
                      <span>新建项目</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={onOpenProject}
                      className="h-8 gap-1.5 px-3"
                    >
                      <FolderOpenIcon className="size-3.5" />
                      <span>打开本地项目</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || !onOpenBundle}
                      onClick={() => onOpenBundle?.()}
                      className="h-8 gap-1.5 px-3 text-muted-foreground"
                    >
                      <PackageOpenIcon className="size-3.5" />
                      <span>打开项目包</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || !onOpenExample}
                      onClick={() => onOpenExample?.()}
                      className="h-8 gap-1.5 px-3 text-muted-foreground"
                    >
                      <SparklesIcon className="size-3.5" />
                      <span>浏览示例</span>
                    </Button>
                  </div>
                </div>
              </section>

              <section className="mt-9">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[15px] font-semibold tracking-tight">
                        最近打开
                      </h2>
                      {!loading && (
                        <span className="rounded-full border border-border/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                          {projects.length}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      本地记录，只保存在这台设备上。
                    </p>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      aria-label="搜索最近项目"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索项目名称或路径"
                      className="h-8 select-text bg-card/40 pl-8 text-xs placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[0, 1, 2].map((index) => (
                      <div
                        key={index}
                        className="overflow-hidden rounded-xl border border-border/60 bg-card/30"
                      >
                        <div className="aspect-[16/10] animate-pulse bg-muted/40" />
                        <div className="space-y-2 px-3.5 py-3">
                          <div className="h-3 w-24 animate-pulse rounded bg-muted/50" />
                          <div className="h-2.5 w-32 animate-pulse rounded bg-muted/30" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filtered.length > 0 ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((project) => (
                      <RecentCard
                        key={project.root}
                        project={project}
                        busy={busy}
                        onOpen={onOpenRecent}
                        onRemove={onRemoveRecent}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-12 text-center">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-muted-foreground">
                      <FolderOpenIcon className="size-5" />
                    </div>
                    <h3 className="mt-3 text-sm font-medium">
                      {query ? "没有匹配的项目" : "还没有最近项目"}
                    </h3>
                    <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">
                      {query
                        ? `没有找到包含“${query}”的项目，换个关键词试试。`
                        : "打开一个已有的 Ombrique 项目，或者从一个空文件夹开始创建。"}
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={onOpenProject}
                        className="h-8 gap-1.5 px-3"
                      >
                        <FolderOpenIcon className="size-3.5" />
                        <span>打开项目</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onCreateProject}
                        className="h-8 gap-1.5 px-3"
                      >
                        <FolderPlusIcon className="size-3.5" />
                        <span>新建项目</span>
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              <section className="mt-9 grid gap-3 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                <QuickLink
                  icon={SparklesIcon}
                  title="打开示例项目"
                  description="看看 Frame、文字和组件如何用 TSX 组织。"
                  action={onOpenExample}
                  disabled={busy}
                />
                <QuickLink
                  icon={PackageOpenIcon}
                  title="打开 .ombrique 项目包"
                  description="离线分发包，解压后直接进入编辑。"
                  action={onOpenBundle}
                  disabled={busy}
                />
                <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/30 p-3.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                    <BoxIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium">工作区快捷键</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Kbd className="bg-muted/50">Ctrl</Kbd>
                      <span>+</span>
                      <Kbd className="bg-muted/50">O</Kbd>
                      <span>打开项目</span>
                      <span className="mx-1 text-border">·</span>
                      <Kbd className="bg-muted/50">Ctrl</Kbd>
                      <span>+</span>
                      <Kbd className="bg-muted/50">N</Kbd>
                      <span>新建</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
