import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyCommentsDoc,
  createThread,
  deleteMessage,
  deleteThread,
  loadComments,
  parseComments,
  replyToThread,
  resolveThread,
  saveComments,
  serializeComments,
  unresolveThread,
} from "./comments";

describe("comments schema and state transitions", () => {
  it("creates a thread with a canvas anchor", () => {
    const doc = createEmptyCommentsDoc();
    const { thread } = createThread(doc, {
      anchor: {
        type: "canvas",
        pageId: "page_1",
        x: 150,
        y: 220,
      },
      author: "Alice",
      body: "Need to check spacing here",
    });
    expect(thread.anchor).toEqual({
      type: "canvas",
      pageId: "page_1",
      x: 150,
      y: 220,
    });
    expect(thread.resolved).toBe(false);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]?.author).toBe("Alice");
    expect(thread.messages[0]?.body).toBe("Need to check spacing here");
  });

  it("creates a thread with a node anchor", () => {
    const doc = createEmptyCommentsDoc();
    const { doc: nextDoc, thread } = createThread(doc, {
      anchor: {
        type: "node",
        nodeRef: {
          file: "pages/home.tsx",
          start: 100,
          end: 250,
          path: [0, 1],
        },
        pageId: "page_1",
        x: 200,
        y: 300,
      },
      author: "Bob",
      body: "Change button color",
    });

    expect(nextDoc.threads).toHaveLength(1);
    expect(thread.anchor.type).toBe("node");
    if (thread.anchor.type === "node") {
      expect(thread.anchor.nodeRef.file).toBe("pages/home.tsx");
      expect(thread.anchor.nodeRef.path).toEqual([0, 1]);
    }
  });

  it("replies to an existing thread", () => {
    const initial = createEmptyCommentsDoc();
    const { doc: doc1 } = createThread(initial, {
      anchor: { type: "canvas", pageId: "p1", x: 10, y: 10 },
      author: "Alice",
      body: "First message",
      id: "thread_1",
    });

    const { doc: doc2, message } = replyToThread(doc1, "thread_1", {
      author: "Bob",
      body: "Second message reply",
    });

    expect(doc2.threads[0]?.messages).toHaveLength(2);
    expect(message.body).toBe("Second message reply");
    expect(doc2.threads[0]?.messages[1]?.author).toBe("Bob");
  });

  it("throws when replying to non-existent thread", () => {
    const doc = createEmptyCommentsDoc();
    expect(() =>
      replyToThread(doc, "missing", { author: "Alice", body: "Hello" }),
    ).toThrow();
  });

  it("resolves and unresolves a thread", () => {
    const initial = createEmptyCommentsDoc();
    const { doc: doc1 } = createThread(initial, {
      anchor: { type: "canvas", pageId: "p1", x: 0, y: 0 },
      author: "Alice",
      body: "Fix alignment",
      id: "th_res",
    });

    const resolvedDoc = resolveThread(doc1, "th_res", "Charlie");
    expect(resolvedDoc.threads[0]?.resolved).toBe(true);
    expect(resolvedDoc.threads[0]?.resolvedBy).toBe("Charlie");
    expect(resolvedDoc.threads[0]?.resolvedAt).toBeDefined();

    const unresolvedDoc = unresolveThread(resolvedDoc, "th_res");
    expect(unresolvedDoc.threads[0]?.resolved).toBe(false);
    expect(unresolvedDoc.threads[0]?.resolvedBy).toBeUndefined();
    expect(unresolvedDoc.threads[0]?.resolvedAt).toBeUndefined();
  });

  it("deletes a message and removes thread if no messages remain", () => {
    const initial = createEmptyCommentsDoc();
    const { doc: doc1, thread } = createThread(initial, {
      anchor: { type: "canvas", pageId: "p1", x: 0, y: 0 },
      author: "Alice",
      body: "Single message",
      id: "th_del",
    });
    const msgId = thread.messages[0]?.id ?? "";
    const doc2 = deleteMessage(doc1, "th_del", msgId);
    expect(doc2.threads).toHaveLength(0);
  });

  it("deletes a thread completely", () => {
    const initial = createEmptyCommentsDoc();
    const { doc: doc1 } = createThread(initial, {
      anchor: { type: "canvas", pageId: "p1", x: 0, y: 0 },
      author: "Alice",
      body: "To be deleted",
      id: "th_remove",
    });

    const doc2 = deleteThread(doc1, "th_remove");
    expect(doc2.threads).toHaveLength(0);
  });

  it("serializes and parses comments roundtrip", () => {
    const initial = createEmptyCommentsDoc();
    const { doc } = createThread(initial, {
      anchor: { type: "canvas", pageId: "p1", x: 40, y: 80 },
      author: "Designer",
      body: "Roundtrip test",
    });

    const json = serializeComments(doc);
    const parsed = parseComments(json);
    expect(parsed).toEqual(doc);
  });

  it("rejects invalid JSON or malformed schema", () => {
    expect(() => parseComments("invalid json")).toThrow();
    expect(() =>
      parseComments(JSON.stringify({ version: 2, threads: [] })),
    ).toThrow();
    expect(() =>
      parseComments(
        JSON.stringify({
          version: 1,
          threads: [{ id: "t1", anchor: { type: "unknown" }, messages: [] }],
        }),
      ),
    ).toThrow();
  });
});

describe("comments disk persistence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `ombrique-comments-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads empty doc when file does not exist", () => {
    const loaded = loadComments(tempDir);
    expect(loaded.version).toBe(1);
    expect(loaded.threads).toEqual([]);
  });

  it("saves comments and reloads them from disk", () => {
    const initial = createEmptyCommentsDoc();
    const { doc } = createThread(initial, {
      anchor: { type: "canvas", pageId: "p1", x: 50, y: 100 },
      author: "Tester",
      body: "Persisted message",
      id: "th_disk",
    });

    saveComments(tempDir, doc);
    const reloaded = loadComments(tempDir);
    expect(reloaded).toEqual(doc);
  });
});
