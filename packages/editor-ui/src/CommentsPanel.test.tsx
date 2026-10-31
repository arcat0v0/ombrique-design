import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommentThread } from "@ombrique/protocol";
import { CommentsPanel } from "./CommentsPanel";

afterEach(cleanup);

describe("CommentsPanel", () => {
  const sampleThreads: CommentThread[] = [
    {
      id: "thread_1",
      anchor: {
        type: "canvas",
        pageId: "p1",
        x: 100,
        y: 200,
      },
      messages: [
        {
          id: "msg_1",
          author: "Alice",
          body: "Need to increase font size here",
          createdAt: new Date().toISOString(),
        },
        {
          id: "msg_2",
          author: "Bob",
          body: "Done, bumped to 18px",
          createdAt: new Date().toISOString(),
        },
      ],
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "thread_2",
      anchor: {
        type: "node",
        nodeRef: {
          file: "pages/home.tsx",
          start: 50,
          end: 120,
        },
      },
      messages: [
        {
          id: "msg_3",
          author: "Charlie",
          body: "Button color checked",
          createdAt: new Date().toISOString(),
        },
      ],
      resolved: true,
      resolvedAt: new Date().toISOString(),
      resolvedBy: "Charlie",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it("renders threads and filters by open and resolved", () => {
    render(<CommentsPanel comments={sampleThreads} />);

    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Need to increase font size here")).toBeDefined();
    expect(screen.queryByText("Button color checked")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^已解决/ }));
    expect(screen.getByText("Charlie")).toBeDefined();
    expect(screen.getByText("Button color checked")).toBeDefined();
    expect(screen.queryByText("Need to increase font size here")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^全部/ }));
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Charlie")).toBeDefined();
  });

  it("selects, replies, resolves, and deletes a thread", () => {
    const onSelectCommentThread = vi.fn();
    const onReplyCommentThread = vi.fn().mockResolvedValue(undefined);
    const onResolveCommentThread = vi.fn().mockResolvedValue(undefined);
    const onDeleteCommentThread = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <CommentsPanel
        comments={sampleThreads}
        activeCommentThreadId={null}
        onSelectCommentThread={onSelectCommentThread}
        onReplyCommentThread={onReplyCommentThread}
        onResolveCommentThread={onResolveCommentThread}
        onDeleteCommentThread={onDeleteCommentThread}
      />,
    );

    const msgBtn = screen.getByRole("button", {
      name: "查看评论: Need to increase font size here",
    });
    fireEvent.click(msgBtn);
    expect(onSelectCommentThread).toHaveBeenCalledWith("thread_1");

    rerender(
      <CommentsPanel
        comments={sampleThreads}
        activeCommentThreadId="thread_1"
        onSelectCommentThread={onSelectCommentThread}
        onReplyCommentThread={onReplyCommentThread}
        onResolveCommentThread={onResolveCommentThread}
        onDeleteCommentThread={onDeleteCommentThread}
      />,
    );

    expect(screen.getByText("Done, bumped to 18px")).toBeDefined();

    const input = screen.getByPlaceholderText("回复讨论...");
    fireEvent.change(input, { target: { value: "Looks great now" } });
    const form = input.closest("form");
    if (form) fireEvent.submit(form);

    expect(onReplyCommentThread).toHaveBeenCalledWith("thread_1", {
      author: "Designer",
      body: "Looks great now",
    });

    fireEvent.click(screen.getByRole("button", { name: "标记为已解决" }));
    expect(onResolveCommentThread).toHaveBeenCalledWith("thread_1", "Designer");

    fireEvent.click(screen.getByRole("button", { name: "删除评论" }));
    expect(onDeleteCommentThread).toHaveBeenCalledWith("thread_1");
  });
});
