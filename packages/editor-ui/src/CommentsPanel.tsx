import { useState } from "react";
import {
  CheckCircle2Icon,
  CircleIcon,
  CornerDownRightIcon,
  MessageSquareIcon,
  Trash2Icon,
  SendIcon,
} from "lucide-react";
import type { CommentAnchor, CommentThread } from "@ombrique/protocol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface CommentsPanelProps {
  comments?: CommentThread[];
  activeCommentThreadId?: string | null;
  onSelectCommentThread?: (threadId: string | null) => void;
  onCreateCommentThread?: (thread: {
    anchor: CommentAnchor;
    author: string;
    body: string;
  }) => Promise<void>;
  onReplyCommentThread?: (
    threadId: string,
    message: { author: string; body: string },
  ) => Promise<void>;
  onResolveCommentThread?: (threadId: string, author?: string) => Promise<void>;
  onUnresolveCommentThread?: (threadId: string) => Promise<void>;
  onDeleteCommentThread?: (threadId: string) => Promise<void>;
  onDeleteCommentMessage?: (
    threadId: string,
    messageId: string,
  ) => Promise<void>;
}

export function CommentsPanel({
  comments = [],
  activeCommentThreadId,
  onSelectCommentThread,
  onReplyCommentThread,
  onResolveCommentThread,
  onUnresolveCommentThread,
  onDeleteCommentThread,
  onDeleteCommentMessage,
}: CommentsPanelProps) {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const filteredThreads = comments.filter((thread) => {
    if (filter === "open") return !thread.resolved;
    if (filter === "resolved") return thread.resolved;
    return true;
  });

  const handleReplySubmit = async (e: React.FormEvent, threadId: string) => {
    e.preventDefault();
    if (!replyText.trim() || !onReplyCommentThread) return;
    setReplying(true);
    try {
      await onReplyCommentThread(threadId, {
        author: "Designer",
        body: replyText.trim(),
      });
      setReplyText("");
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b border-border p-2 gap-1 select-none">
        <div className="flex items-center gap-1">
          <Button
            variant={filter === "open" ? "secondary" : "ghost"}
            size="xs"
            className="h-6 text-[11px] px-2"
            onClick={() => setFilter("open")}
          >
            未解决 ({comments.filter((c) => !c.resolved).length})
          </Button>
          <Button
            variant={filter === "resolved" ? "secondary" : "ghost"}
            size="xs"
            className="h-6 text-[11px] px-2"
            onClick={() => setFilter("resolved")}
          >
            已解决 ({comments.filter((c) => c.resolved).length})
          </Button>
          <Button
            variant={filter === "all" ? "secondary" : "ghost"}
            size="xs"
            className="h-6 text-[11px] px-2"
            onClick={() => setFilter("all")}
          >
            全部 ({comments.length})
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col p-2 gap-2">
          {filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
              <MessageSquareIcon className="size-8 opacity-40" />
              <span className="text-xs">暂无评论</span>
              <span className="text-[11px] opacity-75">
                在画布上选择评论工具 (快捷键 C) 点击节点或画布添加图钉评论
              </span>
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isSelected = thread.id === activeCommentThreadId;
              const firstMsg = thread.messages[0];
              const replyCount = Math.max(0, thread.messages.length - 1);
              const anchorLabel =
                thread.anchor.type === "node"
                  ? (thread.anchor.nodeRef.file.split("/").pop() ?? "节点")
                  : `画布 (${Math.round(thread.anchor.x)}, ${Math.round(thread.anchor.y)})`;

              const dateStr = thread.createdAt
                ? new Date(thread.createdAt).toLocaleString(undefined, {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <div
                  key={thread.id}
                  className={`flex flex-col rounded-md border p-2.5 gap-2 text-xs transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-4 p-0 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (thread.resolved) {
                            void onUnresolveCommentThread?.(thread.id);
                          } else {
                            void onResolveCommentThread?.(
                              thread.id,
                              "Designer",
                            );
                          }
                        }}
                        aria-label={
                          thread.resolved ? "标记为未解决" : "标记为已解决"
                        }
                        title={
                          thread.resolved ? "标记为未解决" : "标记为已解决"
                        }
                      >
                        {thread.resolved ? (
                          <CheckCircle2Icon className="size-3.5 text-primary" />
                        ) : (
                          <CircleIcon className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-auto p-0 font-medium truncate hover:bg-transparent hover:underline text-xs"
                        onClick={() =>
                          onSelectCommentThread?.(isSelected ? null : thread.id)
                        }
                      >
                        {firstMsg?.author ?? "匿名"}
                      </Button>
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1 text-muted-foreground"
                      >
                        {anchorLabel}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {dateStr}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDeleteCommentThread?.(thread.id);
                        }}
                        aria-label="删除评论"
                        title="删除评论"
                      >
                        <Trash2Icon className="size-3" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto p-0 justify-start text-left text-xs font-normal text-foreground/90 whitespace-pre-wrap pl-5 hover:bg-transparent"
                    aria-label={`查看评论: ${firstMsg?.body}`}
                    onClick={() =>
                      onSelectCommentThread?.(isSelected ? null : thread.id)
                    }
                  >
                    {firstMsg?.body}
                  </Button>

                  {isSelected && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-border mt-1 pl-5">
                      {thread.messages.slice(1).map((msg) => (
                        <div
                          key={msg.id}
                          className="flex flex-col rounded bg-muted/40 p-2 gap-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{msg.author}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(msg.createdAt).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-4 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  onDeleteCommentMessage?.(thread.id, msg.id)
                                }
                                title="删除回复"
                              >
                                <Trash2Icon className="size-2.5" />
                              </Button>
                            </div>
                          </div>
                          <p className="whitespace-pre-wrap">{msg.body}</p>
                        </div>
                      ))}

                      <form
                        onSubmit={(e) => handleReplySubmit(e, thread.id)}
                        className="flex items-center gap-1.5 mt-1"
                      >
                        <Input
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="回复讨论..."
                          className="h-7 text-xs flex-1"
                        />
                        <Button
                          type="submit"
                          size="xs"
                          className="h-7 px-2.5"
                          disabled={!replyText.trim() || replying}
                        >
                          <SendIcon className="size-3" />
                        </Button>
                      </form>
                    </div>
                  )}

                  {!isSelected && replyCount > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground pl-5">
                      <CornerDownRightIcon className="size-3" />
                      <span>{replyCount} 条回复</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
