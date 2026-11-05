import { connect } from "node:net";
import type { Socket } from "node:net";
import type {
  AgentClientToHost,
  AgentHostToClient,
  AgentPresenceTarget,
  AgentQuery,
  DocToShell,
  ShellToDoc,
} from "@ombrique/protocol";
import {
  agentClientToHostSchema,
  agentHostToClientSchema,
} from "@ombrique/protocol";
import { ToolError } from "./errors";

export type AgentClientState =
  | "connecting"
  | "waiting-project"
  | "initializing"
  | "ready"
  | "project-closed"
  | "closed";

export interface AgentSocketClientOptions {
  socketPath: string;
  clientName?: string;
}

interface PendingQuery {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: unknown) => void;
  timeout: NodeJS.Timeout;
}

interface DocWaiter {
  predicate: (message: DocToShell) => boolean;
  resolve: (message: DocToShell) => void;
  reject: (error: unknown) => void;
  timeout: NodeJS.Timeout;
}

interface StateWaiter {
  state: AgentClientState;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class AgentSocketClient {
  private readonly socketPath: string;
  private readonly clientName: string;
  private socket: Socket | null = null;
  private buffer = "";
  private requestSeq = 0;
  private readonly pending = new Map<string, PendingQuery>();
  private readonly docWaiters = new Set<DocWaiter>();
  private readonly stateWaiters = new Set<StateWaiter>();
  private readonly stateListeners = new Set<
    (state: AgentClientState) => void
  >();
  private connected: {
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null = null;
  private stateValue: AgentClientState = "connecting";
  private actorValue: string | null = null;
  private projectRootValue: string | null = null;
  private generationValue = 0;

  constructor(options: AgentSocketClientOptions) {
    this.socketPath = options.socketPath;
    this.clientName = options.clientName ?? "ombrique-mcp";
  }

  get state(): AgentClientState {
    return this.stateValue;
  }

  get actor(): string | null {
    return this.actorValue;
  }

  get projectRoot(): string | null {
    return this.projectRootValue;
  }

  get generation(): number {
    return this.generationValue;
  }

  async connect(): Promise<void> {
    if (this.socket) return;
    const socket = connect(this.socketPath);
    this.socket = socket;
    socket.setNoDelay(true);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("close", () => this.handleClose());
    socket.on("error", () => {
      socket.destroy();
    });
    const connected = Promise.withResolvers<void>();
    this.connected = {
      resolve: connected.resolve,
      reject: connected.reject,
    };
    const socketReady = Promise.withResolvers<void>();
    socket.once("connect", socketReady.resolve);
    socket.once("error", socketReady.reject);
    try {
      await socketReady.promise;
      await connected.promise;
    } catch (error) {
      this.closeSocket();
      throw new ToolError(
        "bridge_unavailable",
        `cannot connect to Ombrique Agent bridge at ${this.socketPath}: ${String(error)}`,
      );
    }
    if (this.stateValue === "initializing") await this.waitForReady();
  }

  async close(): Promise<void> {
    if (this.stateValue === "closed") return;
    this.setState("closed");
    this.closeSocket();
  }

  async waitForState(state: AgentClientState): Promise<void> {
    if (this.stateValue === state) return;
    if (this.stateValue === "closed")
      throw new ToolError("bridge_closed", "agent bridge connection is closed");
    const waiting = Promise.withResolvers<void>();
    this.stateWaiters.add({
      state,
      resolve: waiting.resolve,
      reject: waiting.reject,
    });
    return waiting.promise;
  }

  onState(listener: (state: AgentClientState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  async waitForReady(): Promise<void> {
    if (this.stateValue === "ready") return;
    if (
      this.stateValue === "waiting-project" ||
      this.stateValue === "project-closed" ||
      this.stateValue === "closed"
    )
      throw new ToolError(
        "project_closed",
        "no Ombrique project is open; open a project in the desktop app",
      );
    await this.waitForState("ready");
  }

  async query(request: AgentQuery): Promise<Record<string, unknown>> {
    this.requestSeq += 1;
    const id = `m${this.requestSeq}`;
    const waiting = Promise.withResolvers<Record<string, unknown>>();
    const timeout = setTimeout(() => {
      if (!this.pending.delete(id)) return;
      waiting.reject(
        new ToolError(
          "query_timeout",
          `bridge query timed out: ${request.type}`,
        ),
      );
    }, 20000);
    this.pending.set(id, {
      resolve: waiting.resolve,
      reject: waiting.reject,
      timeout,
    });
    try {
      this.send({ kind: "query", id, request });
      return await waiting.promise;
    } finally {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(id);
      }
    }
  }

  sendShell(message: ShellToDoc): void {
    this.send({ kind: "shell", message });
  }

  sendActivity(targets: readonly AgentPresenceTarget[]): void {
    this.send({
      kind: "activity",
      targets: targets.map((target) => ({
        file: target.file,
        path: [...target.path],
      })),
    });
  }

  nextDoc(predicate: (message: DocToShell) => boolean): Promise<DocToShell> {
    const waiting = Promise.withResolvers<DocToShell>();
    const timeout = setTimeout(() => {
      if (!this.docWaiters.delete(waiter)) return;
      waiting.reject(
        new ToolError("doc_timeout", "timed out waiting for document event"),
      );
    }, 20000);
    const waiter: DocWaiter = {
      predicate,
      resolve: waiting.resolve,
      reject: waiting.reject,
      timeout,
    };
    this.docWaiters.add(waiter);
    return waiting.promise;
  }

  private send(message: AgentClientToHost): void {
    if (!this.socket || this.socket.destroyed || this.stateValue === "closed")
      throw new ToolError("bridge_closed", "agent bridge connection is closed");
    const parsed = agentClientToHostSchema.parse(message);
    this.socket.write(`${JSON.stringify(parsed)}\n`);
  }

  private beginInitialize(): void {
    this.setState("initializing");
    this.send({ kind: "initialize", client: this.clientName });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    while (this.buffer.includes("\n")) {
      const index = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line.length === 0) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const parsed = agentHostToClientSchema.safeParse(raw);
      if (!parsed.success) continue;
      this.handleMessage(parsed.data);
    }
  }

  private handleMessage(message: AgentHostToClient): void {
    if (message.kind === "connected") {
      this.actorValue = message.session.actor;
      this.generationValue = message.generation;
      this.connected?.resolve();
      this.connected = null;
      if (message.projectOpen) this.beginInitialize();
      else this.setState("waiting-project");
      return;
    }
    if (message.kind === "ready") {
      this.actorValue = message.session.actor;
      this.generationValue = message.generation;
      this.setState("ready");
      return;
    }
    if (message.kind === "projectAvailable") {
      const changed = message.generation !== this.generationValue;
      this.projectRootValue = message.root;
      this.generationValue = message.generation;
      if (this.stateValue === "initializing") return;
      if (this.stateValue === "ready" && !changed) return;
      this.beginInitialize();
      return;
    }
    if (message.kind === "projectClosed") {
      this.generationValue = message.generation;
      this.projectRootValue = null;
      this.rejectPending(
        new ToolError(
          "project_closed",
          "the Ombrique project was closed or switched",
        ),
      );
      this.setState("project-closed");
      return;
    }
    if (message.kind === "error") {
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          clearTimeout(pending.timeout);
          pending.reject(new ToolError("bridge_error", message.message));
        }
        return;
      }
      if (this.stateValue === "connecting") {
        this.connected?.reject(new ToolError("bridge_error", message.message));
        this.connected = null;
      }
      return;
    }
    if (message.kind === "queryResult") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      pending.resolve(message.payload);
      return;
    }
    for (const waiter of [...this.docWaiters]) {
      if (!waiter.predicate(message.message)) continue;
      this.docWaiters.delete(waiter);
      clearTimeout(waiter.timeout);
      waiter.resolve(message.message);
    }
  }

  private rejectPending(error: unknown): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
    for (const waiter of this.docWaiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.docWaiters.clear();
  }

  private setState(state: AgentClientState): void {
    this.stateValue = state;
    for (const listener of this.stateListeners) listener(state);
    for (const waiter of [...this.stateWaiters]) {
      if (waiter.state === state) {
        this.stateWaiters.delete(waiter);
        waiter.resolve();
        continue;
      }
      if (
        (state === "closed" || state === "project-closed") &&
        (waiter.state === "ready" || waiter.state === "initializing")
      ) {
        this.stateWaiters.delete(waiter);
        waiter.reject(
          new ToolError("project_closed", "the Ombrique project is not open"),
        );
      }
    }
  }

  private handleClose(): void {
    if (this.stateValue === "closed") return;
    this.connected?.reject(
      new ToolError("bridge_closed", "agent bridge connection closed"),
    );
    this.connected = null;
    this.rejectPending(
      new ToolError("bridge_closed", "agent bridge connection closed"),
    );
    this.setState("closed");
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
  }
}
