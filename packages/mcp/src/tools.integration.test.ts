import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentService } from "@ombrique/doc-service";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentBridge } from "../../../apps/desktop/src/main/agent-bridge";
import {
  isPresenceEvent,
  type PresenceEvent,
} from "../../../apps/desktop/src/presence";
import { type McpTestHarness, startMcpHarness } from "./test-harness";

const HOME_PAGE = `import { Frame } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400, height: 200 }}>
        <h1 data-name="Title" style={{ fontSize: 32, color: "#111111" }}>Ship faster</h1>
      </div>
    </Frame>
  );
}
`;

let harness: McpTestHarness;
let projectRoot: string;
let service: DocumentService;
let bridge: AgentBridge | null = null;
let docHostMessages: Record<string, unknown>[];
let presenceEvents: PresenceEvent[];

function setupProject(root: string) {
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(
    join(root, "ombrique.json"),
    JSON.stringify(
      {
        formatVersion: 1,
        pages: [{ id: "p1", name: "Home", file: "pages/home.tsx" }],
      },
      null,
      2,
    ),
  );
  writeFileSync(join(root, "pages/home.tsx"), HOME_PAGE);
  writeFileSync(join(root, "tokens.css"), ":root {\n}\n");
}

const connectTools = (maxHandles?: number) => harness.connectTools(maxHandles);

beforeEach(async () => {
  harness = await startMcpHarness({ setup: setupProject });
  projectRoot = harness.projectRoot;
  service = harness.service;
  bridge = harness.bridge;
  docHostMessages = harness.docHostMessages;
  presenceEvents = harness.presenceEvents;
});

afterEach(async () => {
  await harness.close();
  bridge = null;
});

describe("MCP document tools", () => {
  it("reads state, trees, nodes, and applies handle edits", async () => {
    const { tools } = await connectTools();
    const state = await tools.readState();
    expect(state.pages.map((page) => page.file)).toContain("pages/home.tsx");
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const root = tree.nodes[0];
    const hero = root?.children[0];
    const title = hero?.children[0];
    if (!root || !hero || !title) throw new Error("missing tree nodes");
    const node = await tools.readNode({ handle: title.handle });
    expect(node.tag).toBe("h1");
    expect(node.name).toBe("Title");
    expect(node.style.some((prop) => prop.key === "fontSize")).toBe(true);
    const transaction = await tools.applyEdits({
      commands: [
        {
          kind: "setStyle",
          target: { handle: title.handle },
          declarations: [["color", "#00ff00"]],
        },
      ],
    });
    expect(transaction.origin).toBe("agent");
    expect(readFileSync(join(projectRoot, "pages/home.tsx"), "utf8")).toContain(
      'color: "#00ff00"',
    );
  });

  it("invalidates every file handle after a structural edit", async () => {
    const { tools } = await connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const title = tree.nodes[0]?.children[0]?.children[0];
    if (!title) throw new Error("missing title handle");
    await tools.applyEdits({
      commands: [
        {
          kind: "duplicateNode",
          target: { handle: title.handle },
          dx: 20,
          dy: 20,
        },
      ],
    });
    await expect(
      tools.readNode({ handle: title.handle }),
    ).rejects.toMatchObject({
      code: "handle_not_found",
    });
  });

  it("returns stale when a node fingerprint no longer matches", async () => {
    const { tools } = await connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const title = tree.nodes[0]?.children[0]?.children[0];
    if (!title) throw new Error("missing title handle");
    const current = service.project.files.get("pages/home.tsx")?.text ?? "";
    service.writeRaw(
      "pages/home.tsx",
      current.replace("Ship faster", "Ship slower"),
    );
    await expect(
      tools.readNode({ handle: title.handle }),
    ).rejects.toMatchObject({
      code: "stale_handle",
    });
    await expect(
      tools.applyEdits({
        commands: [
          {
            kind: "setText",
            target: { handle: title.handle },
            text: "Changed",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "stale_handle",
      failedCommandIndex: 0,
    });
  });

  it("rejects a page above the per-page handle limit without issuing handles", async () => {
    const { tools } = await connectTools(2);
    await expect(
      tools.readTree({ page: "pages/home.tsx" }),
    ).rejects.toMatchObject({ code: "handle_limit" });
    expect(tools.handles.size).toBe(0);
  });

  it("rejects edits after the project closes", async () => {
    const { client, tools } = await connectTools();
    bridge?.projectClosed("closed");
    await client.waitForState("project-closed");
    await expect(
      tools.applyEdits({
        commands: [{ kind: "createToken", name: "x", value: "#ffffff" }],
      }),
    ).rejects.toMatchObject({ code: "project_closed" });
  });

  it("does not share handles between shim sessions", async () => {
    const first = await connectTools();
    const second = await connectTools();
    const tree = await first.tools.readTree({ page: "pages/home.tsx" });
    const title = tree.nodes[0]?.children[0]?.children[0];
    if (!title) throw new Error("missing title handle");
    await expect(
      second.tools.readNode({ handle: title.handle }),
    ).rejects.toMatchObject({ code: "handle_not_found" });
  });

  it("uses independent agent focus without rewriting user selection", async () => {
    const { tools } = await connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const title = tree.nodes[0]?.children[0]?.children[0];
    if (!title) throw new Error("missing title handle");
    const shellCountBefore = docHostMessages.filter(
      (message) => message.type === "shell",
    ).length;
    const selected = await tools.select({ handles: [title.handle] });
    expect(selected).toMatchObject({ ok: true });
    expect(
      docHostMessages.filter((message) => message.type === "shell"),
    ).toHaveLength(shellCountBefore);
    const snapshot = [...presenceEvents]
      .reverse()
      .find(
        (event): event is Extract<PresenceEvent, { kind: "snapshot" }> =>
          isPresenceEvent(event) && event.kind === "snapshot",
      );
    expect(snapshot).toBeDefined();
    expect(snapshot?.sessions[0]?.targets).toEqual([
      { file: "pages/home.tsx", path: title.path },
    ]);
  });

  it("routes screenshot and export results to the originating session", async () => {
    const first = await connectTools();
    const second = await connectTools();
    const [firstShot, secondShot] = await Promise.all([
      first.tools.screenshot({ page: "first" }),
      second.tools.screenshot({ page: "second" }),
    ]);
    expect(firstShot.data).toBe("png:first");
    expect(secondShot.data).toBe("png:second");
    await expect(
      first.tools.exportFile({ file: "pages/home.tsx", format: "png" }),
    ).resolves.toMatchObject({
      ok: true,
      written: ["/tmp/agent-export.png"],
    });
  });

  it("clears focus and flashes when the project closes", async () => {
    const { client, tools } = await connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const title = tree.nodes[0]?.children[0]?.children[0];
    if (!title) throw new Error("missing title handle");
    await tools.select({ handles: [title.handle] });
    bridge?.projectClosed("closed");
    await client.waitForState("project-closed");
    const snapshot = [...presenceEvents]
      .reverse()
      .find(
        (event): event is Extract<PresenceEvent, { kind: "snapshot" }> =>
          isPresenceEvent(event) && event.kind === "snapshot",
      );
    expect(snapshot?.clearFlashes).toBe(true);
    expect(snapshot?.sessions[0]?.targets).toEqual([]);
  });
});
