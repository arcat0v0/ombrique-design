import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  commentsDocSchema,
  type CommentAnchor,
  type CommentMessage,
  type CommentThread,
  type CommentsDoc,
} from "@ombrique/protocol";
import { writeFileAtomic } from "./paths";

export const COMMENTS_FILE = "comments.json";

export function createEmptyCommentsDoc(): CommentsDoc {
  return {
    version: 1,
    threads: [],
  };
}

export function parseComments(raw: string): CommentsDoc {
  const parsed = JSON.parse(raw);
  return commentsDocSchema.parse(parsed);
}

export function serializeComments(doc: CommentsDoc): string {
  const validated = commentsDocSchema.parse(doc);
  return JSON.stringify(validated, null, 2);
}

export function createThread(
  doc: CommentsDoc,
  input: {
    anchor: CommentAnchor;
    author: string;
    body: string;
    id?: string;
  },
): { doc: CommentsDoc; thread: CommentThread } {
  const now = new Date().toISOString();
  const threadId =
    input.id ??
    `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const firstMessage: CommentMessage = {
    id: messageId,
    author: input.author,
    body: input.body,
    createdAt: now,
  };
  const thread: CommentThread = {
    id: threadId,
    anchor: input.anchor,
    messages: [firstMessage],
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };
  const updatedDoc: CommentsDoc = {
    ...doc,
    threads: [...doc.threads, thread],
  };
  return { doc: updatedDoc, thread };
}

export function replyToThread(
  doc: CommentsDoc,
  threadId: string,
  input: {
    author: string;
    body: string;
    id?: string;
  },
): { doc: CommentsDoc; message: CommentMessage } {
  const now = new Date().toISOString();
  const messageId =
    input.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const message: CommentMessage = {
    id: messageId,
    author: input.author,
    body: input.body,
    createdAt: now,
  };
  let found = false;
  const updatedThreads = doc.threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    found = true;
    return {
      ...thread,
      messages: [...thread.messages, message],
      updatedAt: now,
    };
  });
  if (!found) {
    throw new Error(`Thread not found: ${threadId}`);
  }
  return {
    doc: {
      ...doc,
      threads: updatedThreads,
    },
    message,
  };
}

export function resolveThread(
  doc: CommentsDoc,
  threadId: string,
  author?: string,
): CommentsDoc {
  const now = new Date().toISOString();
  let found = false;
  const updatedThreads = doc.threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    found = true;
    return {
      ...thread,
      resolved: true,
      resolvedAt: now,
      resolvedBy: author,
      updatedAt: now,
    };
  });
  if (!found) {
    throw new Error(`Thread not found: ${threadId}`);
  }
  return { ...doc, threads: updatedThreads };
}

export function unresolveThread(
  doc: CommentsDoc,
  threadId: string,
): CommentsDoc {
  const now = new Date().toISOString();
  let found = false;
  const updatedThreads = doc.threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    found = true;
    const { resolvedAt, resolvedBy, ...rest } = thread;
    return {
      ...rest,
      resolved: false,
      updatedAt: now,
    };
  });
  if (!found) {
    throw new Error(`Thread not found: ${threadId}`);
  }
  return { ...doc, threads: updatedThreads };
}

export function deleteThread(doc: CommentsDoc, threadId: string): CommentsDoc {
  const filtered = doc.threads.filter((t) => t.id !== threadId);
  return { ...doc, threads: filtered };
}

export function deleteMessage(
  doc: CommentsDoc,
  threadId: string,
  messageId: string,
): CommentsDoc {
  const updatedThreads = doc.threads
    .map((thread) => {
      if (thread.id !== threadId) return thread;
      const remainingMessages = thread.messages.filter(
        (m) => m.id !== messageId,
      );
      return {
        ...thread,
        messages: remainingMessages,
      };
    })
    .filter((thread) => thread.messages.length > 0);
  return { ...doc, threads: updatedThreads };
}

export function loadComments(projectRoot: string): CommentsDoc {
  const fullPath = resolve(projectRoot, COMMENTS_FILE);
  if (!existsSync(fullPath)) {
    return createEmptyCommentsDoc();
  }
  const content = readFileSync(fullPath, "utf8");
  return parseComments(content);
}

export function saveComments(projectRoot: string, doc: CommentsDoc): void {
  const fullPath = resolve(projectRoot, COMMENTS_FILE);
  const serialized = serializeComments(doc);
  writeFileAtomic(fullPath, serialized);
}
