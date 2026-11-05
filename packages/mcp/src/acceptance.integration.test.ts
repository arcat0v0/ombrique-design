import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  createBundle,
  type DocumentService,
  listDesignFiles,
  planCommands,
} from "@ombrique/doc-service";
import type { EditCommand, NodeRef } from "@ombrique/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Project from "../../doc-service/src/project";
import { AgentSocketClient } from "./client";
import type { HandleEditCommand } from "./commands";
import { startMcpHarness, type McpTestHarness } from "./test-harness";
import type { TreeNode } from "./tools";

const planHooks = vi.hoisted(() => ({
  afterPlan: null as (() => void) | null,
}));

vi.mock("../../doc-service/src/project", async (importOriginal) => {
  const actual = await importOriginal<typeof Project>();
  return {
    ...actual,
    planCommands: (
      snapshot: Parameters<typeof actual.planCommands>[0],
      commands: Parameters<typeof actual.planCommands>[1],
    ) => {
      const outcome = actual.planCommands(snapshot, commands);
      planHooks.afterPlan?.();
      return outcome;
    },
  };
});

const HOME_PAGE = `import { Frame, Text } from "@ombrique/runtime";

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

const VARIANT_PAGE = `import { Frame, Text } from "@ombrique/runtime";

export default function Variants() {
  return (
    <Frame name="Variants" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <Frame name="Card primary" x={96} y={96} width={320} height={200} fill="#2f6bff">
        <Text x={24} y={24} width={272} fontSize={20} fill="#ffffff">Primary</Text>
      </Frame>
      <Frame name="Card compact" x={456} y={96} width={320} height={200} fill="#14141a">
        <Text x={24} y={24} width={272} fontSize={20} fill="#ffffff">Compact</Text>
      </Frame>
    </Frame>
  );
}
`;

const COMPONENT_PAGE = `import { Frame, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <Frame name="Hero" x={96} y={96} width={320} height={200} fill="#2f6bff">
        <Text x={24} y={24} width={272} fontSize={20} fill="#ffffff">Hero</Text>
      </Frame>
    </Frame>
  );
}
`;

let harness: McpTestHarness | null = null;
let tempRoots: string[] = [];

function page(functionName: string, label: string): string {
  return `import { Frame, Text } from "@ombrique/runtime";

export default function ${functionName}() {
  return (
    <Frame name="${functionName}" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <Text data-name="${label} Title" style={{ position: "absolute", left: 96, top: 96, width: 640, fontSize: 40, color: "#111111" }}>${label} title</Text>
      <Text data-name="${label} Body" style={{ position: "absolute", left: 96, top: 160, width: 640, fontSize: 18, color: "#222222" }}>${label} body</Text>
    </Frame>
  );
}
`;
}

function largePage(index: number, count: number): string {
  const children = Array.from(
    { length: count },
    (_, child) =>
      `      <Text data-name="n${child}" x={${16 + (child % 24) * 56}} y={${24 + Math.floor(child / 24) * 28}} width={48} fontSize={12} fill="#14141a">n${child}</Text>`,
  ).join("\n");
  return `import { Frame, Text } from "@ombrique/runtime";

export default function Large${index}() {
  return (
    <Frame name="Large ${index}" x={0} y={0} width={1440} height={900} fill="#ffffff">
${children}
    </Frame>
  );
}
`;
}

function createProject(
  pages: Record<string, string>,
  extra: Record<string, string> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "ombrique-acceptance-"));
  tempRoots.push(root);
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(
    join(root, "ombrique.json"),
    JSON.stringify(
      {
        formatVersion: 1,
        pages: Object.keys(pages).map((file, index) => ({
          id: `p${index + 1}`,
          name: basename(file, ".tsx"),
          file,
        })),
      },
      null,
      2,
    ),
  );
  for (const [file, text] of Object.entries(pages))
    writeFileSync(join(root, file), text);
  writeFileSync(join(root, "tokens.css"), ":root {\n}\n");
  for (const [file, text] of Object.entries(extra)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

function copyExampleProject(): string {
  const source = fileURLToPath(
    new URL("../../../example-project", import.meta.url),
  );
  const root = mkdtempSync(join(tmpdir(), "ombrique-acceptance-example-"));
  cpSync(source, root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function findNode(
  nodes: readonly TreeNode[],
  predicate: (node: TreeNode) => boolean,
): TreeNode | null {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const child = findNode(node.children, predicate);
    if (child) return child;
  }
  return null;
}

function refAt(
  service: DocumentService,
  file: string,
  path: number[],
): NodeRef {
  const element = service.project.index.byPath(file, path);
  if (!element) throw new Error(`missing element at ${file}:${path.join("/")}`);
  return {
    file: element.ref.file,
    start: element.ref.start,
    end: element.ref.end,
    path: element.path,
  };
}

function resolveCount(h: McpTestHarness): number {
  return h.docHostMessages.filter((message) => message.type === "resolve")
    .length;
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

beforeEach(() => {
  planHooks.afterPlan = null;
  tempRoots = [];
});

afterEach(async () => {
  if (harness) await harness.close();
  harness = null;
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots = [];
});

describe("acceptance: single-page project", () => {
  it("connects over a real socket and lands a patch on disk", async () => {
    const root = createProject({ "pages/home.tsx": HOME_PAGE });
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools();

    const state = await tools.readState();
    expect(state.projectRoot).toBe(root);
    expect(state.pages.map((entry) => entry.file)).toContain("pages/home.tsx");

    const smallResolvesBefore = resolveCount(harness);
    const smallReadStart = performance.now();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const smallReadMs = performance.now() - smallReadStart;
    const smallResolves = resolveCount(harness) - smallResolvesBefore;
    console.log(
      `[baseline] read_tree small-page nodes=${tree.handleCount} ms=${smallReadMs.toFixed(1)} bytes=${Buffer.byteLength(JSON.stringify(tree), "utf8")} handles=${tree.handleCount} resolveQueries=${smallResolves}`,
    );
    const title = findNode(tree.nodes, (node) => node.name === "Title");
    if (!title || !tree.nodes[0]) throw new Error("missing tree nodes");
    expect(tree.nodes[0].name).toBe("Home");

    const smallApplyStart = performance.now();
    const transaction = await tools.applyEdits({
      commands: [
        {
          kind: "setStyle",
          target: { handle: title.handle },
          declarations: [["color", "#00ff00"]],
        },
      ],
    });
    const smallApplyMs = performance.now() - smallApplyStart;
    console.log(
      `[baseline] apply_edits small-page nodes=${tree.handleCount} commands=1 ms=${smallApplyMs.toFixed(1)}`,
    );

    expect(transaction).toMatchObject({
      origin: "agent",
      actor: "agent-1",
      changedFiles: ["pages/home.tsx"],
    });
    const text = read(join(root, "pages/home.tsx"));
    expect(text).toContain('color: "#00ff00"');
    expect(text).toContain("fontSize: 32");

    const entries = harness.service.historyEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor: "agent-1",
      stale: false,
      files: ["pages/home.tsx"],
    });
    expect(harness.applyLog).toEqual(["agent-1:start", "agent-1:end"]);
  });
});

describe("acceptance: multi-page project", () => {
  function fixture(): string {
    return createProject({
      "pages/alpha.tsx": page("Alpha", "Alpha"),
      "pages/beta.tsx": page("Beta", "Beta"),
      "pages/gamma.tsx": page("Gamma", "Gamma"),
    });
  }

  it("keeps two concurrent sessions on their own files without interleaving", async () => {
    const root = fixture();
    harness = await startMcpHarness({ projectRoot: root });
    const first = await harness.connectTools();
    const second = await harness.connectTools();

    const firstTree = await first.tools.readTree({ page: "pages/alpha.tsx" });
    const firstTitle = findNode(firstTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    if (!firstTitle) throw new Error("missing title");

    await expect(
      second.tools.readNode({ handle: firstTitle.handle }),
    ).rejects.toMatchObject({ code: "handle_not_found" });

    const secondTree = await second.tools.readTree({ page: "pages/beta.tsx" });
    const secondTitle = findNode(secondTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    if (!secondTitle) throw new Error("missing titles");
    const crossSessionNode = await second.tools.readNode({
      handle: firstTitle.handle,
    });
    expect(crossSessionNode.file).toBe("pages/beta.tsx");
    expect(crossSessionNode.name).toBe("Beta Title");

    const [firstTx, secondTx] = await Promise.all([
      first.tools.applyEdits({
        commands: [
          {
            kind: "setStyle",
            target: { handle: firstTitle.handle },
            declarations: [["color", "#00ff00"]],
          },
        ],
      }),
      second.tools.applyEdits({
        commands: [
          {
            kind: "setStyle",
            target: { handle: secondTitle.handle },
            declarations: [["color", "#0000ff"]],
          },
        ],
      }),
    ]);

    expect(firstTx.actor).toBe("agent-1");
    expect(firstTx.changedFiles).toEqual(["pages/alpha.tsx"]);
    expect(secondTx.actor).toBe("agent-2");
    expect(secondTx.changedFiles).toEqual(["pages/beta.tsx"]);
    expect(read(join(root, "pages/alpha.tsx"))).toContain('color: "#00ff00"');
    expect(read(join(root, "pages/beta.tsx"))).toContain('color: "#0000ff"');

    expect(harness.applyLog).toHaveLength(4);
    for (let index = 0; index < harness.applyLog.length; index += 2) {
      const start = harness.applyLog[index];
      const end = harness.applyLog[index + 1];
      expect(start).toMatch(/:start$/);
      expect(end).toBe(start?.replace(":start", ":end"));
    }
    const applyOrder = harness.applyLog
      .filter((entry) => entry.endsWith(":start"))
      .map((entry) => entry.slice(0, -":start".length));
    const entries = harness.service.historyEntries();
    expect(entries.map((entry) => entry.actor)).toEqual(applyOrder);
    for (const entry of entries)
      expect(entry.files).toEqual([
        entry.actor === "agent-1" ? "pages/alpha.tsx" : "pages/beta.tsx",
      ]);
  });

  it("serializes two sessions writing the same file and attributes each entry", async () => {
    const root = fixture();
    harness = await startMcpHarness({ projectRoot: root });
    const first = await harness.connectTools();
    const second = await harness.connectTools();

    const firstTree = await first.tools.readTree({ page: "pages/alpha.tsx" });
    const secondTree = await second.tools.readTree({ page: "pages/alpha.tsx" });
    const firstTitle = findNode(firstTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    const secondBody = findNode(secondTree.nodes, (node) =>
      node.name.endsWith("Body"),
    );
    if (!firstTitle || !secondBody) throw new Error("missing nodes");

    const [firstTx, secondTx] = await Promise.all([
      first.tools.applyEdits({
        commands: [
          {
            kind: "setStyle",
            target: { handle: firstTitle.handle },
            declarations: [["color", "#00ff00"]],
          },
        ],
      }),
      second.tools.applyEdits({
        commands: [
          {
            kind: "setStyle",
            target: { handle: secondBody.handle },
            declarations: [["color", "#0000ff"]],
          },
        ],
      }),
    ]);

    expect(firstTx.changedFiles).toEqual(["pages/alpha.tsx"]);
    expect(secondTx.changedFiles).toEqual(["pages/alpha.tsx"]);
    expect(firstTx.actor).not.toBe(secondTx.actor);
    const text = read(join(root, "pages/alpha.tsx"));
    expect(text).toContain('color: "#00ff00"');
    expect(text).toContain('color: "#0000ff"');

    const entries = harness.service.historyEntries();
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.actor))).toEqual(
      new Set(["agent-1", "agent-2"]),
    );
    expect(entries.map((entry) => entry.files)).toEqual([
      ["pages/alpha.tsx"],
      ["pages/alpha.tsx"],
    ]);
    expect(harness.applyLog).toHaveLength(4);
    const starts = harness.applyLog.filter((entry) => entry.endsWith(":start"));
    expect(starts).toHaveLength(2);
    expect(
      new Set(starts.map((entry) => entry.slice(0, -":start".length))),
    ).toEqual(new Set(["agent-1", "agent-2"]));
  });

  it("rejects the whole batch when an external write lands in the planning window", async () => {
    const root = fixture();
    harness = await startMcpHarness({ projectRoot: root });
    const first = await harness.connectTools();
    const second = await harness.connectTools();

    const firstTree = await first.tools.readTree({ page: "pages/alpha.tsx" });
    const firstTitle = findNode(firstTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    if (!firstTitle) throw new Error("missing title");
    await first.tools.applyEdits({
      commands: [
        {
          kind: "setStyle",
          target: { handle: firstTitle.handle },
          declarations: [["color", "#00ff00"]],
        },
      ],
    });
    const afterFirst = read(join(root, "pages/alpha.tsx"));

    const secondTree = await second.tools.readTree({ page: "pages/alpha.tsx" });
    const secondBody = findNode(secondTree.nodes, (node) =>
      node.name.endsWith("Body"),
    );
    if (!secondBody) throw new Error("missing body");

    const external = `${afterFirst}\n// external write`;
    planHooks.afterPlan = () => {
      writeFileSync(join(root, "pages/alpha.tsx"), external);
    };

    await expect(
      second.tools.applyEdits({
        commands: [
          {
            kind: "setStyle",
            target: { handle: secondBody.handle },
            declarations: [["color", "#0000ff"]],
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "command_failed",
      message: expect.stringContaining("pages/alpha.tsx"),
    });

    expect(read(join(root, "pages/alpha.tsx"))).toBe(external);
    expect(harness.service.historyEntries()).toHaveLength(1);
    expect(harness.service.historyEntries()[0]?.actor).toBe("agent-1");
    expect(harness.applyLog).toEqual([
      "agent-1:start",
      "agent-1:end",
      "agent-2:start",
      "agent-2:end",
    ]);
  });

  it("detects a presence conflict when both sessions focus the same node", async () => {
    const root = fixture();
    harness = await startMcpHarness({ projectRoot: root });
    const first = await harness.connectTools();
    const second = await harness.connectTools();
    const firstTree = await first.tools.readTree({ page: "pages/alpha.tsx" });
    const secondTree = await second.tools.readTree({ page: "pages/alpha.tsx" });
    const firstTitle = findNode(firstTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    const secondTitle = findNode(secondTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    if (!firstTitle || !secondTitle) throw new Error("missing titles");
    const shellsBefore = harness.docHostMessages.filter(
      (message) => message.type === "shell",
    ).length;

    await first.tools.select({ handles: [firstTitle.handle] });
    await second.tools.select({ handles: [secondTitle.handle] });

    expect(
      harness.docHostMessages.filter((message) => message.type === "shell"),
    ).toHaveLength(shellsBefore);
    const snapshot = harness.bridge.presenceSnapshot();
    if (snapshot.kind !== "snapshot") throw new Error("missing snapshot");
    expect(snapshot.conflict).toEqual({
      target: { file: "pages/alpha.tsx", path: firstTitle.path },
      actors: ["agent-1", "agent-2"],
    });
  });
});

describe("acceptance: component and variant project", () => {
  it("creates a component across the page and component file", async () => {
    const root = createProject({ "pages/home.tsx": COMPONENT_PAGE });
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const hero = findNode(tree.nodes, (node) => node.name === "Hero");
    if (!hero) throw new Error("missing hero");

    const transaction = await tools.applyEdits({
      commands: [
        {
          kind: "createComponent",
          target: { handle: hero.handle },
          name: "HeroCard",
        },
      ],
    });

    expect([...transaction.changedFiles].sort()).toEqual([
      "components/HeroCard.tsx",
      "pages/home.tsx",
    ]);
    const pageText = read(join(root, "pages/home.tsx"));
    expect(pageText).toContain(
      'import { HeroCard } from "../components/HeroCard";',
    );
    expect(pageText).toContain("<HeroCard />");
    const componentText = read(join(root, "components/HeroCard.tsx"));
    expect(componentText).toContain("export function HeroCard()");
    expect(componentText).toContain("<Frame");

    const entries = harness.service.historyEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actor).toBe("agent-1");
    expect([...(entries[0]?.files ?? [])].sort()).toEqual([
      "components/HeroCard.tsx",
      "pages/home.tsx",
    ]);
  });

  it("creates a variant set across the page and component file", async () => {
    const root = createProject({ "pages/home.tsx": VARIANT_PAGE });
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const primary = findNode(
      tree.nodes,
      (node) => node.name === "Card primary",
    );
    const compact = findNode(
      tree.nodes,
      (node) => node.name === "Card compact",
    );
    if (!primary || !compact) throw new Error("missing variant targets");

    const transaction = await tools.applyEdits({
      commands: [
        {
          kind: "createVariantSet",
          targets: [{ handle: primary.handle }, { handle: compact.handle }],
          name: "CardSet",
          axes: [{ name: "tone", values: ["primary", "compact"] }],
        },
      ],
    });

    expect([...transaction.changedFiles].sort()).toEqual([
      "components/CardSet.tsx",
      "pages/home.tsx",
    ]);
    const pageText = read(join(root, "pages/home.tsx"));
    expect(pageText).toContain('<CardSet tone="primary" />');
    expect(pageText).toContain('<CardSet tone="compact" />');
    const componentText = read(join(root, "components/CardSet.tsx"));
    expect(componentText).toContain("export const variantAxes");
    expect(componentText).toContain("export function CardSet");
    expect(componentText).toContain('tone === "compact"');
    expect(harness.service.historyEntries()[0]?.files).toHaveLength(2);
  });

  it("does not partially write a variant batch when the component file appears after planning", async () => {
    const root = createProject({ "pages/home.tsx": VARIANT_PAGE });
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const primary = findNode(
      tree.nodes,
      (node) => node.name === "Card primary",
    );
    const compact = findNode(
      tree.nodes,
      (node) => node.name === "Card compact",
    );
    if (!primary || !compact) throw new Error("missing variant targets");
    const external = "// external component";
    planHooks.afterPlan = () => {
      mkdirSync(join(root, "components"), { recursive: true });
      writeFileSync(join(root, "components/CardSet.tsx"), external);
    };

    await expect(
      tools.applyEdits({
        commands: [
          {
            kind: "createVariantSet",
            targets: [{ handle: primary.handle }, { handle: compact.handle }],
            name: "CardSet",
            axes: [{ name: "tone", values: ["primary", "compact"] }],
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "command_failed",
      message: expect.stringContaining("components/CardSet.tsx"),
    });

    expect(read(join(root, "pages/home.tsx"))).toBe(VARIANT_PAGE);
    expect(read(join(root, "components/CardSet.tsx"))).toBe(external);
    expect(harness.service.project.files.has("components/CardSet.tsx")).toBe(
      false,
    );
    expect(harness.service.historyEntries()).toHaveLength(0);
    expect(harness.applyLog).toEqual(["agent-1:start", "agent-1:end"]);
  });

  it("does not partially write a component batch when the page changes after planning", async () => {
    const root = createProject({ "pages/home.tsx": COMPONENT_PAGE });
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools();
    const tree = await tools.readTree({ page: "pages/home.tsx" });
    const hero = findNode(tree.nodes, (node) => node.name === "Hero");
    if (!hero) throw new Error("missing hero");
    const external = `${COMPONENT_PAGE}\n// external write`;
    planHooks.afterPlan = () => {
      writeFileSync(join(root, "pages/home.tsx"), external);
    };

    await expect(
      tools.applyEdits({
        commands: [
          {
            kind: "createComponent",
            target: { handle: hero.handle },
            name: "HeroCard",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "command_failed",
      message: expect.stringContaining("pages/home.tsx"),
    });

    expect(read(join(root, "pages/home.tsx"))).toBe(external);
    expect(harness.service.project.files.has("components/HeroCard.tsx")).toBe(
      false,
    );
    expect(harness.service.historyEntries()).toHaveLength(0);
  });
});

describe("acceptance: multi-axis, icon, and component fixture", () => {
  it("parses the example fixture and patches data attributes", async () => {
    const root = copyExampleProject();
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools();

    expect(harness.service.project.files.has("pages/showcase.tsx")).toBe(true);
    expect(harness.service.project.files.has("components/IconBadge.tsx")).toBe(
      true,
    );
    expect(harness.service.project.files.has("icons/acme.json")).toBe(false);
    expect(listDesignFiles(root)).not.toContain("icons/acme.json");

    const axes = harness.service.project.index.styles.tokens.axes;
    const mode = axes.find((axis) => axis.name === "mode");
    const density = axes.find((axis) => axis.name === "density");
    expect(mode?.values).toEqual(expect.arrayContaining(["light", "dark"]));
    expect(density?.values).toEqual(
      expect.arrayContaining(["regular", "condensed"]),
    );

    const elements = [...harness.service.project.index.elements.values()];
    expect(elements.filter((element) => element.tag === "Icon")).toHaveLength(
      1,
    );
    expect(
      elements.filter((element) => element.tag === "IconBadge"),
    ).toHaveLength(2);
    const showcase = harness.service.project.index.pages.find(
      (entry) => entry.file === "pages/showcase.tsx",
    );
    expect(showcase?.root?.dataAttrs["data-mode"]).toBe("dark");
    expect(showcase?.root?.dataAttrs["data-density"]).toBe("condensed");

    const tree = await tools.readTree({ page: "pages/showcase.tsx" });
    const rootNode = tree.nodes[0];
    if (!rootNode) throw new Error("missing showcase root");
    const icon = findNode(tree.nodes, (node) => node.name === "Sparkles");
    expect(icon?.tag).toBe("icon");

    const transaction = await tools.applyEdits({
      commands: [
        {
          kind: "setAttrs",
          target: { handle: rootNode.handle },
          attrs: { "data-density": "regular" },
        },
      ],
    });
    expect(transaction.changedFiles).toEqual(["pages/showcase.tsx"]);
    const pageText = read(join(root, "pages/showcase.tsx"));
    expect(pageText).toContain('data-density="regular"');
    expect(pageText).toContain('data-mode="dark"');
    expect(pageText).toContain('iconName="sparkles"');
    expect(pageText).toContain("<IconBadge");

    const bundlePath = join(harness.userData, "example.ombrique");
    await createBundle(root, bundlePath);
    const payload = JSON.parse(
      gunzipSync(readFileSync(bundlePath)).toString("utf8"),
    ) as {
      entries: Record<string, string>;
      manifest: { files: Array<{ path: string }> };
    };
    expect(Object.keys(payload.entries)).toContain("icons/acme.json");
    expect(Object.keys(payload.entries)).toContain("components/IconBadge.tsx");
    expect(Object.keys(payload.entries)).toContain("pages/showcase.tsx");
    expect(payload.manifest.files.map((file) => file.path)).toContain(
      "icons/acme.json",
    );
  });
});

describe("acceptance: multi-page undo and redo", () => {
  it("undoes designer edits across pages and never undoes agent entries", async () => {
    const root = createProject({
      "pages/alpha.tsx": page("Alpha", "Alpha"),
      "pages/beta.tsx": page("Beta", "Beta"),
      "pages/gamma.tsx": page("Gamma", "Gamma"),
    });
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools();
    const service = harness.service;

    const alphaRef = refAt(service, "pages/alpha.tsx", [0, 0]);
    const betaRef = refAt(service, "pages/beta.tsx", [0, 0]);
    const betaBefore = read(join(root, "pages/beta.tsx"));
    const alphaBefore = read(join(root, "pages/alpha.tsx"));

    service.apply(
      [
        {
          kind: "setStyle",
          target: alphaRef,
          declarations: [["color", "#aa0000"]],
        },
      ],
      [],
      "designer",
    );
    const alphaAfter = read(join(root, "pages/alpha.tsx"));
    service.apply(
      [
        {
          kind: "setStyle",
          target: betaRef,
          declarations: [["color", "#bb0000"]],
        },
      ],
      [],
      "designer",
    );
    const betaAfter = read(join(root, "pages/beta.tsx"));

    expect(service.undo()).not.toBeNull();
    expect(read(join(root, "pages/beta.tsx"))).toBe(betaBefore);
    expect(read(join(root, "pages/alpha.tsx"))).toBe(alphaAfter);
    expect(service.redo()).not.toBeNull();
    expect(read(join(root, "pages/beta.tsx"))).toBe(betaAfter);

    const gammaTree = await tools.readTree({ page: "pages/gamma.tsx" });
    const gammaTitle = findNode(gammaTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    if (!gammaTitle) throw new Error("missing gamma title");
    await tools.applyEdits({
      commands: [
        {
          kind: "setStyle",
          target: { handle: gammaTitle.handle },
          declarations: [["color", "#333333"]],
        },
      ],
    });
    const gammaAfterAgent = read(join(root, "pages/gamma.tsx"));

    expect(service.undo()).not.toBeNull();
    expect(read(join(root, "pages/beta.tsx"))).toBe(betaBefore);
    expect(read(join(root, "pages/gamma.tsx"))).toBe(gammaAfterAgent);
    expect(service.redo()).not.toBeNull();
    expect(read(join(root, "pages/beta.tsx"))).toBe(betaAfter);
    expect(read(join(root, "pages/gamma.tsx"))).toBe(gammaAfterAgent);
    expect(service.redo()).toBeNull();

    expect(service.undo()).not.toBeNull();
    expect(read(join(root, "pages/beta.tsx"))).toBe(betaBefore);
    expect(service.undo()).not.toBeNull();
    expect(read(join(root, "pages/alpha.tsx"))).toBe(alphaBefore);
    expect(read(join(root, "pages/beta.tsx"))).toBe(betaBefore);
    expect(read(join(root, "pages/gamma.tsx"))).toBe(gammaAfterAgent);

    expect(service.redo()).not.toBeNull();
    expect(read(join(root, "pages/alpha.tsx"))).toBe(alphaAfter);
    expect(service.redo()).not.toBeNull();
    expect(read(join(root, "pages/beta.tsx"))).toBe(betaAfter);
    expect(service.redo()).toBeNull();
    expect(read(join(root, "pages/gamma.tsx"))).toBe(gammaAfterAgent);

    const entries = service.historyEntries();
    expect(entries.map((entry) => entry.actor)).toEqual([
      "designer",
      "designer",
      "agent-1",
    ]);
    expect(service.canRedo).toBe(false);
  });
});

describe("acceptance: page-scoped handle atomicity", () => {
  it("keeps the previous page handles when a read_tree fails", async () => {
    const root = createProject({
      "pages/small.tsx": page("Small", "Small"),
      "pages/big.tsx": largePage(1, 4),
    });
    harness = await startMcpHarness({ projectRoot: root });
    const { tools } = await harness.connectTools(4);

    const smallTree = await tools.readTree({ page: "pages/small.tsx" });
    expect(smallTree.handleCount).toBe(3);
    const title = findNode(smallTree.nodes, (node) =>
      node.name.endsWith("Title"),
    );
    if (!title) throw new Error("missing small title");

    const limitMessage =
      /^single-page handle limit reached \(4\); this read needs 5 handles\. Re-reading the same page cannot help\. Reduce the page size, split the page into smaller pages, or start a new session\.$/;
    await expect(
      tools.readTree({ page: "pages/big.tsx" }),
    ).rejects.toMatchObject({
      code: "handle_limit",
      message: expect.stringMatching(limitMessage),
    });
    expect(tools.handles.size).toBe(3);
    const stillResolves = await tools.readNode({ handle: title.handle });
    expect(stillResolves.file).toBe("pages/small.tsx");

    const reRead = await tools.readTree({ page: "pages/small.tsx" });
    expect(reRead.handleCount).toBe(3);
    await expect(
      tools.readNode({ handle: title.handle }),
    ).rejects.toMatchObject({ code: "handle_not_found" });
  });
});

describe("acceptance: large project baseline", () => {
  it("measures read_tree and apply_edits and enforces the per-page cap", async () => {
    const nodeCount = 700;
    const root = createProject({
      "pages/large-1.tsx": largePage(1, nodeCount),
      "pages/large-2.tsx": largePage(2, nodeCount),
      "pages/large-3.tsx": largePage(3, nodeCount),
    });
    harness = await startMcpHarness({ projectRoot: root });
    const service = harness.service;
    const { tools } = await harness.connectTools();

    const resolvesBeforeFirst = resolveCount(harness);
    const firstStart = performance.now();
    const firstTree = await tools.readTree({ page: "pages/large-1.tsx" });
    const firstMs = performance.now() - firstStart;
    const firstResolves = resolveCount(harness) - resolvesBeforeFirst;
    const firstBytes = Buffer.byteLength(JSON.stringify(firstTree), "utf8");
    console.log(
      `[baseline] read_tree page=pages/large-1.tsx nodes=${nodeCount} ms=${firstMs.toFixed(1)} bytes=${firstBytes} handles=${firstTree.handleCount} resolveQueries=${firstResolves}`,
    );
    expect(firstTree.handleCount).toBe(nodeCount + 1);
    expect(firstResolves).toBe(nodeCount + 1);
    expect(firstMs).toBeGreaterThan(0);
    expect(firstBytes).toBeGreaterThan(0);
    const firstTitle = findNode(firstTree.nodes, (node) => node.name === "n0");
    if (!firstTitle) throw new Error("missing first title");

    const secondStart = performance.now();
    const secondTree = await tools.readTree({ page: "pages/large-2.tsx" });
    const secondMs = performance.now() - secondStart;
    console.log(
      `[baseline] read_tree page=pages/large-2.tsx nodes=${nodeCount} ms=${secondMs.toFixed(1)} bytes=${Buffer.byteLength(JSON.stringify(secondTree), "utf8")} handles=${secondTree.handleCount}`,
    );
    expect(secondTree.handleCount).toBe(nodeCount + 1);
    expect(tools.handles.size).toBe(nodeCount + 1);
    await expect(
      tools.readNode({ handle: firstTitle.handle }),
    ).rejects.toMatchObject({ code: "handle_not_found" });
    await expect(
      tools.applyEdits({
        commands: [
          {
            kind: "setStyle",
            target: { handle: firstTitle.handle },
            declarations: [["color", "#00ff00"]],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "handle_not_found" });
    await expect(
      tools.select({ handles: [firstTitle.handle] }),
    ).rejects.toMatchObject({ code: "handle_not_found" });

    const secondTitle = findNode(
      secondTree.nodes,
      (node) => node.name === "n0",
    );
    if (!secondTitle) throw new Error("missing second title");
    const resolvesBeforeThird = resolveCount(harness);
    const thirdStart = performance.now();
    const thirdTree = await tools.readTree({ page: "pages/large-3.tsx" });
    const thirdMs = performance.now() - thirdStart;
    const thirdResolves = resolveCount(harness) - resolvesBeforeThird;
    console.log(
      `[baseline] read_tree page=pages/large-3.tsx nodes=${nodeCount} ms=${thirdMs.toFixed(1)} bytes=${Buffer.byteLength(JSON.stringify(thirdTree), "utf8")} handles=${thirdTree.handleCount} resolveQueries=${thirdResolves}`,
    );
    expect(thirdTree.handleCount).toBe(nodeCount + 1);
    expect(thirdResolves).toBe(nodeCount + 1);
    expect(tools.handles.size).toBe(nodeCount + 1);
    await expect(
      tools.readNode({ handle: secondTitle.handle }),
    ).rejects.toMatchObject({ code: "handle_not_found" });

    const limitMessage = new RegExp(
      `^single-page handle limit reached \\(100\\); this read needs ${nodeCount + 1} handles\\. Re-reading the same page cannot help\\. Reduce the page size, split the page into smaller pages, or start a new session\\.$`,
    );
    const limited = await harness.connectTools(100);
    await expect(
      limited.tools.readTree({ page: "pages/large-1.tsx" }),
    ).rejects.toMatchObject({
      code: "handle_limit",
      message: expect.stringMatching(limitMessage),
    });
    expect(limited.tools.handles.size).toBe(0);

    const thirdChildren = thirdTree.nodes[0]?.children ?? [];
    const batchTargets = thirdChildren.slice(1, 26);
    expect(batchTargets).toHaveLength(25);

    const planTargets = (indices: number[]): EditCommand[] =>
      indices.map((index) => ({
        kind: "setStyle",
        target: refAt(service, "pages/large-3.tsx", [0, index]),
        declarations: [["color", "#00ff00"]],
      }));
    const planSingleStart = performance.now();
    const planSingle = planCommands(service.project, planTargets([1]));
    const planSingleMs = performance.now() - planSingleStart;
    const planBatchStart = performance.now();
    const planBatch = planCommands(
      service.project,
      planTargets(Array.from({ length: 25 }, (_, index) => index + 1)),
    );
    const planBatchMs = performance.now() - planBatchStart;
    console.log(
      `[baseline] planCommands commands=1 ms=${planSingleMs.toFixed(1)} commands=25 ms=${planBatchMs.toFixed(1)}`,
    );
    expect(planSingle?.changedFiles).toEqual(["pages/large-3.tsx"]);
    expect(planBatch?.changedFiles).toEqual(["pages/large-3.tsx"]);

    const batchStart = performance.now();
    const batchTransaction = await tools.applyEdits({
      commands: batchTargets.map(
        (target): HandleEditCommand => ({
          kind: "setStyle",
          target: { handle: target.handle },
          declarations: [["color", "#0000ff"]],
        }),
      ),
    });
    const batchMs = performance.now() - batchStart;
    console.log(
      `[baseline] apply_edits commands=25 ms=${batchMs.toFixed(1)} changedFiles=${batchTransaction.changedFiles.join(",")}`,
    );
    expect(batchTransaction.changedFiles).toEqual(["pages/large-3.tsx"]);
    expect(batchMs).toBeGreaterThan(0);

    const singleTarget = thirdChildren[0];
    if (!singleTarget) throw new Error("missing single target");
    const singleStart = performance.now();
    const singleTransaction = await tools.applyEdits({
      commands: [
        {
          kind: "setStyle",
          target: { handle: singleTarget.handle },
          declarations: [["color", "#00ff00"]],
        },
      ],
    });
    const singleMs = performance.now() - singleStart;
    console.log(
      `[baseline] apply_edits commands=1 ms=${singleMs.toFixed(1)} changedFiles=${singleTransaction.changedFiles.join(",")}`,
    );
    expect(singleTransaction.changedFiles).toEqual(["pages/large-3.tsx"]);
    expect(singleMs).toBeGreaterThan(0);

    for (let index = 0; index < 4; index += 1) await harness.connectTools();
    expect(harness.bridge.sessions()).toHaveLength(6);
    const seventh = new AgentSocketClient({
      socketPath: harness.socketPath,
      clientName: "seventh",
    });
    await expect(seventh.connect()).rejects.toMatchObject({
      code: "bridge_unavailable",
      message: expect.stringContaining("session limit"),
    });
    await seventh.close();
    expect(harness.bridge.sessions()).toHaveLength(6);
  }, 180000);
});
