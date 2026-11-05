import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentService } from "@ombrique/doc-service";
import { agentHostToClientSchema, shellToDocSchema } from "@ombrique/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentBridge,
  AgentBridgeAlreadyRunningError,
  AGENT_PALETTE,
  socketPathFor,
} from "./agent-bridge";

type TestMessage = Record<string, unknown>;

interface TestClient {
  socket: Socket;
  messages: TestMessage[];
  send: (message: unknown) => void;
  waitFor: (
    predicate: (message: TestMessage) => boolean,
    from?: number,
  ) => Promise<TestMessage>;
  close: () => void;
}

const HOME_PAGE = `import { Frame } from "@ombrique/runtime";

export default function Home() {
  return <Frame name="Home" x={0} y={0} width={400} height={300} fill="#ffffff" />;
}
`;

let userData: string;
let projectRoot: string;
let socketPath: string;
let service: DocumentService;
let bridge: AgentBridge | null = null;
let clients: TestClient[] = [];

function setupProject() {
  mkdirSync(join(projectRoot, "pages"), { recursive: true });
  writeFileSync(
    join(projectRoot, "ombrique.json"),
    JSON.stringify(
      {
        formatVersion: 1,
        pages: [{ id: "p1", name: "Home", file: "pages/home.tsx" }],
      },
      null,
      2,
    ),
  );
  writeFileSync(join(projectRoot, "pages/home.tsx"), HOME_PAGE);
  writeFileSync(join(projectRoot, "tokens.css"), ":root {\n}\n");
}

function sessionOf(message: TestMessage) {
  const parsed = agentHostToClientSchema.parse(message);
  if (parsed.kind !== "connected" && parsed.kind !== "ready")
    throw new Error("expected a session envelope");
  return parsed.session;
}

function errorText(message: TestMessage) {
  const parsed = agentHostToClientSchema.parse(message);
  if (parsed.kind !== "error") throw new Error("expected an error envelope");
  return parsed.message;
}

function payloadOf(message: TestMessage) {
  const parsed = agentHostToClientSchema.parse(message);
  if (parsed.kind !== "queryResult") throw new Error("expected a query result");
  return parsed.payload;
}

function transactionActor(message: TestMessage): string | null {
  const parsed = agentHostToClientSchema.parse(message);
  if (parsed.kind !== "doc" || parsed.message.kind !== "transactionApplied")
    return null;
  return parsed.message.transaction.actor ?? null;
}

function applyCommand(name: string) {
  return {
    kind: "shell",
    message: {
      kind: "applyCommands",
      commands: [{ kind: "createToken", name, value: "#333333" }],
      baseVersions: [],
    },
  };
}

function handleDocHost(message: TestMessage) {
  const type = String(message.type ?? "");
  if (type === "shell") {
    const parsed = shellToDocSchema.safeParse(message.message);
    if (!parsed.success) {
      bridge?.handleDocHostMessage({
        type: "doc",
        message: { kind: "commandFailed", message: "invalid shell message" },
      });
      return;
    }
    const data = parsed.data;
    if (data.kind === "applyCommands") {
      try {
        service.apply(data.commands, data.baseVersions, data.actor);
      } catch (error) {
        bridge?.handleDocHostMessage({
          type: "doc",
          message: { kind: "commandFailed", message: String(error) },
        });
      }
      return;
    }
    if (data.kind === "undo") service.undo();
    if (data.kind === "redo") service.redo();
    if (data.kind === "restoreVersion") service.restoreVersion(data.files);
    if (data.kind === "openProject") service.open(data.path);
    return;
  }
  if (type === "versions") {
    const versions = Object.fromEntries(
      [...service.project.files].map(([file, state]) => [file, state.version]),
    );
    queueMicrotask(() => {
      bridge?.handleDocHostMessage({
        type: "versionsResult",
        id: message.id,
        versions,
      });
    });
    return;
  }
  if (type === "tokens") {
    const { tokens, modes } = service.project.index.styles.tokens;
    bridge?.handleDocHostMessage({
      type: "tokensResult",
      id: message.id,
      tokens,
      modes: modes.map(({ name, isDefault }) => ({ name, isDefault })),
    });
    return;
  }
  if (type === "tree") {
    bridge?.handleDocHostMessage({
      type: "treeResult",
      id: message.id,
      layers: [],
    });
    return;
  }
  if (type === "resolve") {
    bridge?.handleDocHostMessage({
      type: "resolveResult",
      id: message.id,
      element: null,
    });
    return;
  }
  if (type === "styles") {
    bridge?.handleDocHostMessage({
      type: "stylesResult",
      id: message.id,
      styles: [],
    });
  }
}

function createBridge() {
  return new AgentBridge({
    userData,
    platform: "linux",
    sendToDocHost: handleDocHost,
  });
}

async function connectClient(path: string): Promise<TestClient> {
  const socket = connect(path);
  const messages: TestMessage[] = [];
  const waiters = new Set<() => void>();
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length === 0) continue;
      try {
        messages.push(JSON.parse(line) as TestMessage);
      } catch {}
    }
    for (const waiter of [...waiters]) waiter();
  });
  socket.on("error", () => {
    socket.destroy();
  });
  socket.on("close", () => {
    for (const waiter of [...waiters]) waiter();
  });
  const connected = Promise.withResolvers<void>();
  socket.once("connect", connected.resolve);
  socket.once("error", connected.reject);
  await connected.promise;
  const waitFor = (
    predicate: (message: TestMessage) => boolean,
    from = 0,
  ): Promise<TestMessage> => {
    const waiting = Promise.withResolvers<TestMessage>();
    const check = () => {
      const found = messages.slice(from).find(predicate);
      if (found) {
        waiters.delete(check);
        waiting.resolve(found);
      }
    };
    waiters.add(check);
    check();
    return waiting.promise;
  };
  return {
    socket,
    messages,
    send: (message) => socket.write(`${JSON.stringify(message)}\n`),
    waitFor,
    close: () => socket.destroy(),
  };
}

async function initialize(client: TestClient) {
  const from = client.messages.length;
  client.send({ kind: "initialize", client: "test-client" });
  await client.waitFor((message) => message.kind === "ready", from);
}

beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), "ombrique-agent-user-"));
  projectRoot = mkdtempSync(join(tmpdir(), "ombrique-agent-project-"));
  socketPath = socketPathFor(userData, "linux");
  setupProject();
  clients = [];
  service = new DocumentService({
    emit: (message) => {
      bridge?.handleDocHostMessage({ type: "doc", message });
    },
  });
  service.open(projectRoot);
  bridge = createBridge();
  await bridge.start();
  bridge.projectOpened(projectRoot);
});

afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await bridge?.close();
  bridge = null;
  service.close();
  rmSync(userData, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("AgentBridge", () => {
  it("uses a per-user socket path and removes stale socket files", async () => {
    expect(socketPathFor(userData, "linux")).toBe(
      join(userData, "ombrique-mcp.sock"),
    );
    expect(
      socketPathFor(userData, "win32").startsWith("\\\\.\\pipe\\ombrique-"),
    ).toBe(true);
    await bridge?.close();
    writeFileSync(socketPath, "stale", "utf8");
    bridge = createBridge();
    await bridge.start();
    bridge.projectOpened(projectRoot);
    const client = await connectClient(socketPath);
    clients.push(client);
    await client.waitFor((message) => message.kind === "connected");
    expect(existsSync(socketPath)).toBe(true);
    expect(statSync(socketPath).mode & 0o777).toBe(0o600);
  });

  it("rejects a second bridge on the same socket", async () => {
    const second = createBridge();
    await expect(second.start()).rejects.toBeInstanceOf(
      AgentBridgeAlreadyRunningError,
    );
    await second.close();
  });

  it("assigns distinct actors and colors and routes applyCommands actor to DocumentService", async () => {
    const first = await connectClient(socketPath);
    const second = await connectClient(socketPath);
    clients.push(first, second);
    const connectedFirst = await first.waitFor(
      (message) => message.kind === "connected",
    );
    const connectedSecond = await second.waitFor(
      (message) => message.kind === "connected",
    );
    expect(sessionOf(connectedFirst).actor).toBe("agent-1");
    expect(sessionOf(connectedSecond).actor).toBe("agent-2");
    expect(sessionOf(connectedFirst).color).toBe(AGENT_PALETTE[0]);
    expect(sessionOf(connectedSecond).color).toBe(AGENT_PALETTE[1]);
    await initialize(first);
    await initialize(second);
    const firstFrom = first.messages.length;
    const secondFrom = second.messages.length;
    first.send({
      kind: "shell",
      message: {
        kind: "applyCommands",
        commands: [{ kind: "createToken", name: "from-a", value: "#111111" }],
        baseVersions: [],
      },
    });
    second.send({
      kind: "shell",
      message: {
        kind: "applyCommands",
        commands: [{ kind: "createToken", name: "from-b", value: "#222222" }],
        baseVersions: [],
      },
    });
    expect(
      await first.waitFor(
        (message) => transactionActor(message) === "agent-1",
        firstFrom,
      ),
    ).toBeDefined();
    expect(
      await second.waitFor(
        (message) => transactionActor(message) === "agent-2",
        secondFrom,
      ),
    ).toBeDefined();
    const actors = service.historyEntries().map((entry) => entry.actor);
    expect(actors).toContain("agent-1");
    expect(actors).toContain("agent-2");
    expect(actors).not.toContain("designer");
    expect(bridge?.sessions()).toHaveLength(2);
  });

  it("keeps concurrent query responses on their own sessions", async () => {
    const first = await connectClient(socketPath);
    const second = await connectClient(socketPath);
    clients.push(first, second);
    await first.waitFor((message) => message.kind === "connected");
    await second.waitFor((message) => message.kind === "connected");
    await initialize(first);
    await initialize(second);
    const firstFrom = first.messages.length;
    const secondFrom = second.messages.length;
    first.send({
      kind: "query",
      id: "same",
      request: { type: "versions" },
    });
    second.send({
      kind: "query",
      id: "same",
      request: { type: "tokens" },
    });
    const firstResult = await first.waitFor(
      (message) =>
        message.kind === "queryResult" &&
        message.id === "same" &&
        "versions" in payloadOf(message),
      firstFrom,
    );
    const secondResult = await second.waitFor(
      (message) =>
        message.kind === "queryResult" &&
        message.id === "same" &&
        "tokens" in payloadOf(message),
      secondFrom,
    );
    expect(payloadOf(firstResult).versions).toBeDefined();
    expect(payloadOf(firstResult).tokens).toBeUndefined();
    expect(payloadOf(secondResult).tokens).toBeDefined();
    expect(payloadOf(secondResult).versions).toBeUndefined();
  });

  it("rejects the seventh session", async () => {
    for (let index = 0; index < 6; index += 1) {
      const client = await connectClient(socketPath);
      clients.push(client);
      await client.waitFor((message) => message.kind === "connected");
    }
    expect(bridge?.sessions()).toHaveLength(6);
    const seventh = await connectClient(socketPath);
    clients.push(seventh);
    const error = await seventh.waitFor((message) => message.kind === "error");
    expect(errorText(error)).toContain("session limit");
    expect(bridge?.sessions()).toHaveLength(6);
  });

  it("rejects edits after projectClosed until reinitialize", async () => {
    const client = await connectClient(socketPath);
    clients.push(client);
    await client.waitFor((message) => message.kind === "connected");
    await initialize(client);
    let from = client.messages.length;
    bridge?.projectClosed("closed");
    expect(
      await client.waitFor((message) => message.kind === "projectClosed", from),
    ).toBeDefined();
    from = client.messages.length;
    client.send(applyCommand("blocked"));
    const closedError = await client.waitFor(
      (message) => message.kind === "error",
      from,
    );
    expect(errorText(closedError)).toMatch(/project|initialize/i);
    from = client.messages.length;
    bridge?.projectOpened(projectRoot);
    expect(
      await client.waitFor(
        (message) => message.kind === "projectAvailable",
        from,
      ),
    ).toBeDefined();
    from = client.messages.length;
    client.send(applyCommand("before-initialize"));
    const initializeError = await client.waitFor(
      (message) => message.kind === "error",
      from,
    );
    expect(errorText(initializeError)).toMatch(/initialize/i);
    from = client.messages.length;
    client.send({ kind: "initialize", client: "reconnected" });
    await client.waitFor((message) => message.kind === "ready", from);
    from = client.messages.length;
    client.send(applyCommand("allowed"));
    expect(
      await client.waitFor(
        (message) => transactionActor(message) === "agent-1",
        from,
      ),
    ).toBeDefined();
    expect(service.historyEntries().at(-1)?.actor).toBe("agent-1");
  });
});
