import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { connect, createServer } from "node:net";
import type { Server, Socket } from "node:net";
import { dirname, join } from "node:path";
import type {
  AgentClientToHost,
  AgentHostToClient,
  AgentQuery,
  AgentSession,
} from "@ombrique/protocol";
import {
  AGENT_PALETTE,
  agentClientToHostSchema,
  agentHostToClientSchema,
  docToShellSchema,
} from "@ombrique/protocol";
import {
  detectPresenceConflict,
  type PresenceEvent,
  type PresenceSession,
  type PresenceTarget,
} from "../presence";

export { AGENT_PALETTE };

const AGENT_RESULT_TYPES: Record<string, true> = {
  compileResult: true,
  htmlResult: true,
  resolveResult: true,
  treeResult: true,
  versionsResult: true,
  tokensResult: true,
  stylesResult: true,
};

const LOCAL_QUERY_TYPES: Record<string, true> = {
  select: true,
  screenshot: true,
  export: true,
};

export type AgentProjectClosedReason = "closed" | "switch";

export interface AgentScreenshot {
  mimeType: "image/png" | "image/jpeg";
  data: string;
  width: number;
  height: number;
}

export interface AgentExportResult {
  ok: boolean;
  written?: string[];
}

export interface AgentSessionInfo extends AgentSession {
  initialized: boolean;
}

export interface AgentBridgeOptions {
  userData: string;
  platform?: NodeJS.Platform;
  sendToDocHost: (message: Record<string, unknown>) => void;
  maxSessions?: number;
  onPresence?: (event: PresenceEvent) => void;
  captureScreenshot?: (request: { page?: string }) => Promise<AgentScreenshot>;
  exportNode?: (request: unknown) => Promise<AgentExportResult>;
}

interface SessionState {
  info: AgentSessionInfo;
  socket: Socket;
  buffer: string;
  targets: PresenceTarget[];
  pendingTargets: PresenceTarget[];
}

interface PendingQuery {
  sessionId: string;
  clientId: string;
  timeout: NodeJS.Timeout;
}

export class AgentBridgeAlreadyRunningError extends Error {
  constructor(path: string) {
    super(`agent bridge already listening on ${path}`);
    this.name = "AgentBridgeAlreadyRunningError";
  }
}

export function socketPathFor(
  userData: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const hash = createHash("sha256")
      .update(userData)
      .digest("hex")
      .slice(0, 16);
    return `\\\\.\\pipe\\ombrique-${hash}`;
  }
  return join(userData, "ombrique-mcp.sock");
}

export class AgentBridge {
  private readonly userData: string;
  private readonly platform: NodeJS.Platform;
  private readonly sendToDocHost: (message: Record<string, unknown>) => void;
  private readonly maxSessions: number;
  private readonly path: string;
  private readonly onPresence?: (event: PresenceEvent) => void;
  private readonly captureScreenshot?: (request: {
    page?: string;
  }) => Promise<AgentScreenshot>;
  private readonly exportNode?: (
    request: unknown,
  ) => Promise<AgentExportResult>;
  private server: Server | null = null;
  private sessionsMap = new Map<string, SessionState>();
  private pendingQueries = new Map<string, PendingQuery>();
  private sessionSeq = 0;
  private requestSeq = 0;
  private flashSeq = 0;
  private generation = 0;
  private projectOpen = false;
  private projectRoot: string | null = null;

  constructor(options: AgentBridgeOptions) {
    this.userData = options.userData;
    this.platform = options.platform ?? process.platform;
    this.sendToDocHost = options.sendToDocHost;
    this.maxSessions = options.maxSessions ?? 6;
    this.path = socketPathFor(this.userData, this.platform);
    this.onPresence = options.onPresence;
    this.captureScreenshot = options.captureScreenshot;
    this.exportNode = options.exportNode;
  }

  get socketPath(): string {
    return this.path;
  }

  sessions(): readonly AgentSessionInfo[] {
    return [...this.sessionsMap.values()].map(({ info }) => ({ ...info }));
  }

  presenceSnapshot(): PresenceEvent {
    const sessions = this.presenceSessions();
    return {
      kind: "snapshot",
      sessions,
      conflict: detectPresenceConflict(sessions),
    };
  }

  async start(): Promise<void> {
    if (this.server) return;
    if (await this.socketIsLive())
      throw new AgentBridgeAlreadyRunningError(this.path);
    this.removeStaleSocket();
    const server = createServer((socket) => this.accept(socket));
    const listening = Promise.withResolvers<void>();
    server.once("error", listening.reject);
    server.listen(this.path, () => {
      server.off("error", listening.reject);
      if (this.platform !== "win32") chmodSync(this.path, 0o600);
      listening.resolve();
    });
    try {
      await listening.promise;
    } catch (error) {
      server.close();
      throw error;
    }
    server.on("error", () => {
      this.server = null;
    });
    this.server = server;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    for (const session of this.sessionsMap.values()) session.socket.destroy();
    this.sessionsMap.clear();
    for (const pending of this.pendingQueries.values())
      clearTimeout(pending.timeout);
    this.pendingQueries.clear();
    this.emitPresence({ kind: "clear" });
    if (!server) return;
    const closed = Promise.withResolvers<void>();
    server.close(() => closed.resolve());
    await closed.promise;
    if (this.platform !== "win32") {
      try {
        unlinkSync(this.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  projectOpened(root: string): void {
    if (this.projectOpen && this.projectRoot === root) return;
    this.projectOpen = true;
    this.projectRoot = root;
    this.broadcast({
      kind: "projectAvailable",
      root,
      generation: this.generation,
      initializeRequired: true,
    });
    this.emitPresenceSnapshot();
  }

  projectClosed(reason: AgentProjectClosedReason): void {
    this.generation += 1;
    this.projectOpen = false;
    this.projectRoot = null;
    for (const session of this.sessionsMap.values()) {
      session.info.initialized = false;
      session.targets = [];
      session.pendingTargets = [];
      this.send(session, {
        kind: "projectClosed",
        generation: this.generation,
        reason,
      });
    }
    for (const [requestId, pending] of this.pendingQueries) {
      clearTimeout(pending.timeout);
      this.pendingQueries.delete(requestId);
    }
    this.emitPresenceSnapshot(true);
  }

  handleDocHostMessage(message: Record<string, unknown>): boolean {
    const type = String(message.type ?? "");
    if (type === "doc") {
      const parsed = docToShellSchema.safeParse(message.message);
      if (parsed.success) {
        if (parsed.data.kind === "projectOpened")
          this.projectOpened(parsed.data.root);
        if (parsed.data.kind === "transactionApplied")
          this.emitTransactionFlash(parsed.data.transaction.actor);
        if (parsed.data.kind === "commandFailed") {
          for (const session of this.sessionsMap.values())
            session.pendingTargets = [];
        }
        this.broadcast({ kind: "doc", message: parsed.data });
      }
      return false;
    }
    if (
      AGENT_RESULT_TYPES[type] === true &&
      typeof message.id === "string" &&
      message.id.startsWith("agent:")
    ) {
      this.resolveQuery(message.id, message);
      return true;
    }
    return false;
  }

  private async socketIsLive(): Promise<boolean> {
    if (this.platform !== "win32") {
      try {
        if (!statSync(this.path).isSocket()) return false;
      } catch {
        return false;
      }
    }
    let probe: Socket;
    try {
      probe = connect(this.path);
    } catch {
      return false;
    }
    const result = Promise.withResolvers<boolean>();
    probe.setTimeout(200);
    probe.once("connect", () => {
      result.resolve(true);
      probe.destroy();
    });
    probe.once("timeout", () => {
      result.resolve(true);
      probe.destroy();
    });
    probe.once("error", (error: NodeJS.ErrnoException) => {
      result.resolve(error.code !== "ECONNREFUSED" && error.code !== "ENOENT");
      probe.destroy();
    });
    return result.promise;
  }

  private removeStaleSocket(): void {
    if (this.platform === "win32") return;
    mkdirSync(dirname(this.path), { recursive: true });
    try {
      unlinkSync(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private accept(socket: Socket): void {
    if (this.sessionsMap.size >= this.maxSessions) {
      this.sendRaw(socket, {
        kind: "error",
        message: "session limit reached",
      });
      return;
    }
    this.sessionSeq += 1;
    const id = `s${this.sessionSeq}`;
    const color =
      AGENT_PALETTE[(this.sessionSeq - 1) % AGENT_PALETTE.length] ??
      AGENT_PALETTE[0];
    const info: AgentSessionInfo = {
      id,
      actor: `agent-${this.sessionSeq}`,
      color,
      initialized: false,
    };
    const session: SessionState = {
      info,
      socket,
      buffer: "",
      targets: [],
      pendingTargets: [],
    };
    this.sessionsMap.set(id, session);
    socket.setNoDelay(true);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(session, chunk));
    socket.on("close", () => this.dropSession(id));
    socket.on("error", () => {
      socket.destroy();
    });
    this.send(session, {
      kind: "connected",
      session: this.sessionView(info),
      generation: this.generation,
      projectOpen: this.projectOpen,
    });
    if (this.projectOpen && this.projectRoot)
      this.send(session, {
        kind: "projectAvailable",
        root: this.projectRoot,
        generation: this.generation,
        initializeRequired: true,
      });
    this.emitPresenceSnapshot();
  }

  private sessionView(info: AgentSessionInfo): AgentSession {
    const view: AgentSession = {
      id: info.id,
      actor: info.actor,
      color: info.color,
    };
    if (info.client) view.client = info.client;
    return view;
  }

  private onData(session: SessionState, chunk: string): void {
    session.buffer += chunk;
    while (session.buffer.includes("\n")) {
      const index = session.buffer.indexOf("\n");
      const line = session.buffer.slice(0, index).trim();
      session.buffer = session.buffer.slice(index + 1);
      if (line.length === 0) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        this.sendError(session, "invalid JSON");
        continue;
      }
      const parsed = agentClientToHostSchema.safeParse(raw);
      if (!parsed.success) {
        this.sendError(session, "invalid agent message");
        continue;
      }
      this.handleClientMessage(session, parsed.data);
    }
  }

  private handleClientMessage(
    session: SessionState,
    message: AgentClientToHost,
  ): void {
    if (message.kind === "initialize") {
      if (!this.projectOpen) {
        this.sendError(
          session,
          "project is closed; initialize after a new project opens",
        );
        return;
      }
      if (message.client) session.info.client = message.client;
      session.info.initialized = true;
      this.send(session, {
        kind: "ready",
        session: this.sessionView(session.info),
        generation: this.generation,
      });
      return;
    }
    if (message.kind === "activity") {
      if (this.projectOpen && session.info.initialized)
        session.pendingTargets = message.targets.map((target) => ({
          file: target.file,
          path: [...target.path],
        }));
      return;
    }
    if (message.kind === "shell") {
      if (!this.projectOpen) {
        this.sendError(
          session,
          "project is closed; initialize after a new project opens",
        );
        return;
      }
      if (!session.info.initialized) {
        this.sendError(
          session,
          "session is not initialized; send initialize first",
        );
        return;
      }
      if (message.message.kind === "openProject") {
        this.sendError(
          session,
          "project switching is controlled by the desktop app",
        );
        return;
      }
      const shell =
        message.message.kind === "applyCommands"
          ? { ...message.message, actor: session.info.actor }
          : message.message;
      this.sendToDocHost({ type: "shell", message: shell });
      return;
    }
    if (!this.projectOpen || !this.projectRoot) {
      this.sendError(
        session,
        "project is closed; initialize after a new project opens",
        message.id,
      );
      return;
    }
    if (!session.info.initialized) {
      this.sendError(
        session,
        "session is not initialized; send initialize first",
        message.id,
      );
      return;
    }
    this.requestSeq += 1;
    const requestId = `agent:${session.info.id}:${this.requestSeq}`;
    const timeout = setTimeout(() => {
      if (this.pendingQueries.delete(requestId))
        this.sendError(session, `timeout: ${message.request.type}`, message.id);
    }, 20000);
    this.pendingQueries.set(requestId, {
      sessionId: session.info.id,
      clientId: message.id,
      timeout,
    });
    if (LOCAL_QUERY_TYPES[message.request.type] === true) {
      void this.handleLocalQuery(requestId, session, message.request);
      return;
    }
    this.sendToDocHost({
      ...message.request,
      root: this.projectRoot,
      id: requestId,
    });
  }

  private async handleLocalQuery(
    requestId: string,
    session: SessionState,
    request: AgentQuery,
  ): Promise<void> {
    try {
      if (request.type === "select") {
        session.targets = request.targets.map((target) => ({
          file: target.file,
          path: [...target.path],
        }));
        this.emitPresenceSnapshot();
        this.resolveLocalQuery(requestId, {
          ok: true,
          actor: session.info.actor,
          color: session.info.color,
          targets: session.targets,
        });
        return;
      }
      if (request.type === "screenshot") {
        if (!this.captureScreenshot)
          throw new Error("screenshot capture is not available");
        const image = await this.captureScreenshot({ page: request.page });
        this.resolveLocalQuery(requestId, { image });
        return;
      }
      if (request.type === "export") {
        if (!this.exportNode) throw new Error("export is not available");
        const result = await this.exportNode(request.request);
        this.resolveLocalQuery(requestId, {
          ok: result.ok,
          written: result.written,
        });
      }
    } catch (error) {
      this.rejectLocalQuery(requestId, String(error));
    }
  }

  private resolveQuery(
    requestId: string,
    message: Record<string, unknown>,
  ): void {
    const pending = this.pendingQueries.get(requestId);
    if (!pending) return;
    this.pendingQueries.delete(requestId);
    clearTimeout(pending.timeout);
    const session = this.sessionsMap.get(pending.sessionId);
    if (!session) return;
    const error = message.error;
    if (typeof error === "string" && error.length > 0) {
      this.sendError(session, error, pending.clientId);
      return;
    }
    const payload: Record<string, unknown> = { ...message };
    delete payload.type;
    delete payload.id;
    this.send(session, {
      kind: "queryResult",
      id: pending.clientId,
      payload,
    });
  }

  private resolveLocalQuery(
    requestId: string,
    payload: Record<string, unknown>,
  ): void {
    const pending = this.pendingQueries.get(requestId);
    if (!pending) return;
    this.pendingQueries.delete(requestId);
    clearTimeout(pending.timeout);
    const session = this.sessionsMap.get(pending.sessionId);
    if (!session) return;
    this.send(session, {
      kind: "queryResult",
      id: pending.clientId,
      payload,
    });
  }

  private rejectLocalQuery(requestId: string, message: string): void {
    const pending = this.pendingQueries.get(requestId);
    if (!pending) return;
    this.pendingQueries.delete(requestId);
    clearTimeout(pending.timeout);
    const session = this.sessionsMap.get(pending.sessionId);
    if (!session) return;
    this.sendError(session, message, pending.clientId);
  }

  private emitTransactionFlash(actor: string | undefined): void {
    if (!actor) return;
    const session = [...this.sessionsMap.values()].find(
      (candidate) => candidate.info.actor === actor,
    );
    if (!session || session.pendingTargets.length === 0) return;
    this.flashSeq += 1;
    this.emitPresence({
      kind: "flash",
      flash: {
        id: `f${this.flashSeq}`,
        actor: session.info.actor,
        color: session.info.color,
        targets: session.pendingTargets,
        startedAt: Date.now(),
        durationMs: 2000,
      },
    });
    session.pendingTargets = [];
  }

  private presenceSessions(): PresenceSession[] {
    return [...this.sessionsMap.values()].map((session) => ({
      sessionId: session.info.id,
      actor: session.info.actor,
      color: session.info.color,
      targets: session.targets.map((target) => ({
        file: target.file,
        path: [...target.path],
      })),
    }));
  }

  private emitPresenceSnapshot(clearFlashes = false): void {
    const sessions = this.presenceSessions();
    this.emitPresence({
      kind: "snapshot",
      sessions,
      conflict: detectPresenceConflict(sessions),
      clearFlashes,
    });
  }

  private emitPresence(event: PresenceEvent): void {
    this.onPresence?.(event);
  }

  private send(session: SessionState, message: AgentHostToClient): void {
    if (session.socket.destroyed) return;
    const parsed = agentHostToClientSchema.parse(message);
    session.socket.write(`${JSON.stringify(parsed)}\n`);
  }

  private sendRaw(socket: Socket, message: AgentHostToClient): void {
    const parsed = agentHostToClientSchema.parse(message);
    socket.end(`${JSON.stringify(parsed)}\n`);
  }

  private sendError(session: SessionState, message: string, id?: string): void {
    this.send(
      session,
      id ? { kind: "error", message, id } : { kind: "error", message },
    );
  }

  private broadcast(message: AgentHostToClient): void {
    for (const session of this.sessionsMap.values())
      this.send(session, message);
  }

  private dropSession(id: string): void {
    this.sessionsMap.delete(id);
    for (const [requestId, pending] of this.pendingQueries) {
      if (pending.sessionId === id) {
        clearTimeout(pending.timeout);
        this.pendingQueries.delete(requestId);
      }
    }
    this.emitPresenceSnapshot();
  }
}
