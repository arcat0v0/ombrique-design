import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DocumentService,
  TransactionRejectedError,
} from "@ombrique/doc-service";
import { shellToDocSchema } from "@ombrique/protocol";
import { AgentBridge } from "../../../apps/desktop/src/main/agent-bridge";
import { toLayer } from "../../../apps/desktop/src/main/layer-tree";
import type { PresenceEvent } from "../../../apps/desktop/src/presence";
import { AgentSocketClient } from "./client";
import { DocumentTools } from "./tools";

export interface McpHarnessOptions {
  projectRoot?: string;
  setup?: (root: string) => void;
  maxSessions?: number;
}

export interface McpTestHarness {
  readonly userData: string;
  readonly projectRoot: string;
  readonly socketPath: string;
  readonly service: DocumentService;
  readonly bridge: AgentBridge;
  readonly clients: AgentSocketClient[];
  readonly docHostMessages: Record<string, unknown>[];
  readonly presenceEvents: PresenceEvent[];
  readonly applyLog: string[];
  connectTools(
    maxHandles?: number,
  ): Promise<{ client: AgentSocketClient; tools: DocumentTools }>;
  close(): Promise<void>;
}

function resolveElement(
  service: DocumentService,
  file: string,
  path: number[],
) {
  const element = [...service.project.index.elements.values()].find(
    (candidate) =>
      candidate.ref.file === file &&
      candidate.path.length === path.length &&
      candidate.path.every((part, index) => part === path[index]),
  );
  if (!element) return null;
  return {
    ref: element.ref,
    path: element.path,
    tag: element.tag,
    kind: element.kind,
    generated: element.generated,
    name:
      element.dataAttrs["data-name"] ??
      (typeof element.attrs.name?.value === "string"
        ? element.attrs.name.value
        : null),
    text: element.texts.map((text) => text.value).join(""),
    style: element.style.map((prop) => ({
      key: prop.key,
      value: prop.value,
      dynamic: prop.dynamic,
    })),
    props: Object.entries(element.attrs)
      .filter(
        ([key]) =>
          !key.startsWith("data-") && key !== "className" && key !== "style",
      )
      .map(([key, attr]) => ({
        key,
        value: attr.value,
        dynamic: attr.kind === "expression",
      })),
    attrs: Object.entries(element.dataAttrs).map(([key, value]) => ({
      key,
      value,
    })),
  };
}

export async function startMcpHarness(
  options: McpHarnessOptions = {},
): Promise<McpTestHarness> {
  const ownsProjectRoot = options.projectRoot === undefined;
  const userData = mkdtempSync(join(tmpdir(), "ombrique-mcp-user-"));
  const projectRoot =
    options.projectRoot ?? mkdtempSync(join(tmpdir(), "ombrique-mcp-project-"));
  const socketPath = join(userData, "ombrique-mcp.sock");
  const clients: AgentSocketClient[] = [];
  const docHostMessages: Record<string, unknown>[] = [];
  const presenceEvents: PresenceEvent[] = [];
  const applyLog: string[] = [];

  if (ownsProjectRoot) options.setup?.(projectRoot);

  let bridge: AgentBridge | null = null;

  const service = new DocumentService({
    emit: (message) => {
      bridge?.handleDocHostMessage({ type: "doc", message });
    },
  });

  const handleDocHost = (message: Record<string, unknown>) => {
    docHostMessages.push(message);
    const type = String(message.type ?? "");
    if (type === "shell") {
      const parsed = shellToDocSchema.safeParse(message.message);
      if (!parsed.success) return;
      if (parsed.data.kind === "applyCommands") {
        const actor = parsed.data.actor ?? "designer";
        applyLog.push(`${actor}:start`);
        try {
          service.apply(
            parsed.data.commands,
            parsed.data.baseVersions,
            parsed.data.actor,
          );
        } catch (error) {
          if (!(error instanceof TransactionRejectedError)) {
            bridge?.handleDocHostMessage({
              type: "doc",
              message: { kind: "commandFailed", message: String(error) },
            });
          }
        } finally {
          applyLog.push(`${actor}:end`);
        }
        return;
      }
      if (parsed.data.kind === "undo") service.undo();
      if (parsed.data.kind === "redo") service.redo();
      if (parsed.data.kind === "restoreVersion")
        service.restoreVersion(parsed.data.files);
      return;
    }
    if (type === "versions") {
      const versions = Object.fromEntries(
        [...service.project.files].map(([file, state]) => [
          file,
          state.version,
        ]),
      );
      bridge?.handleDocHostMessage({
        type: "versionsResult",
        id: message.id,
        versions,
      });
      return;
    }
    if (type === "tree") {
      const page = service.project.index.pages.find(
        (entry) => entry.file === String(message.file),
      );
      bridge?.handleDocHostMessage({
        type: "treeResult",
        id: message.id,
        layers: page?.root ? [toLayer(page.root)] : [],
      });
      return;
    }
    if (type === "resolve") {
      bridge?.handleDocHostMessage({
        type: "resolveResult",
        id: message.id,
        element: resolveElement(
          service,
          String(message.file),
          message.path as number[],
        ),
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
    if (type === "styles") {
      bridge?.handleDocHostMessage({
        type: "stylesResult",
        id: message.id,
        styles: [],
      });
    }
  };

  service.open(projectRoot);

  const activeBridge = new AgentBridge({
    userData,
    platform: "linux",
    maxSessions: options.maxSessions,
    sendToDocHost: handleDocHost,
    onPresence: (event) => presenceEvents.push(event),
    captureScreenshot: async (request) => ({
      mimeType: "image/png",
      data: `png:${request.page ?? "canvas"}`,
      width: 1,
      height: 1,
    }),
    exportNode: async () => ({
      ok: true,
      written: ["/tmp/agent-export.png"],
    }),
  });
  bridge = activeBridge;
  await activeBridge.start();
  activeBridge.projectOpened(projectRoot);

  const connectTools = async (maxHandles?: number) => {
    const client = new AgentSocketClient({
      socketPath,
      clientName: "mcp-test",
    });
    await client.connect();
    clients.push(client);
    return {
      client,
      tools: new DocumentTools(
        client,
        maxHandles === undefined ? {} : { maxHandles },
      ),
    };
  };

  const close = async () => {
    for (const client of clients) await client.close();
    clients.length = 0;
    await activeBridge.close();
    service.close();
    rmSync(userData, { recursive: true, force: true });
    if (ownsProjectRoot) rmSync(projectRoot, { recursive: true, force: true });
  };

  return {
    userData,
    projectRoot,
    socketPath,
    service,
    bridge: activeBridge,
    clients,
    docHostMessages,
    presenceEvents,
    applyLog,
    connectTools,
    close,
  };
}
