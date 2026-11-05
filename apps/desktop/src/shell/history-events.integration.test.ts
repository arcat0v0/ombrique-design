import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentService } from "@ombrique/doc-service";
import type { DocToShell, HistorySnapshotEntry } from "@ombrique/protocol";
import { createShellState, type ShellBridge } from "./state";

const HOME_PAGE = `import { Frame } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400, height: 200, background: "#ff0000" }}>
        <h1 data-name="Title" style={{ fontSize: 32, color: "#111111" }}>Ship faster</h1>
      </div>
    </Frame>
  );
}
`;

let root: string;
let service: DocumentService;
let emitted: DocToShell[];
let onDoc: (message: DocToShell) => void = () => {};
let onFiles: (message: { files: Record<string, string> }) => void = () => {};

function entries(): HistorySnapshotEntry[] {
  return service.historyEntries().map((entry) => ({
    id: entry.id,
    actor: entry.actor,
    stale: entry.stale,
    createdAt: entry.createdAt,
    files: [...entry.files],
    before: Object.fromEntries(entry.before),
    after: Object.fromEntries(entry.after),
  }));
}

function heroTarget() {
  const page = service.project.index.pages.find(
    (entry) => entry.file === "pages/home.tsx",
  );
  const hero = page?.root?.children[0];
  if (!hero) throw new Error("missing hero element");
  return {
    file: "pages/home.tsx",
    start: hero.ref.start,
    end: hero.ref.end,
    path: hero.path,
  };
}

function applyColor(color: string) {
  service.apply(
    [
      {
        kind: "setStyle",
        target: heroTarget(),
        declarations: [["color", color]],
      },
    ],
    [],
    "agent-1",
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ombrique-history-"));
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(
    join(root, "ombrique.json"),
    JSON.stringify({
      formatVersion: 1,
      pages: [{ id: "p1", name: "Home", file: "pages/home.tsx" }],
    }),
  );
  writeFileSync(join(root, "pages/home.tsx"), HOME_PAGE);
  emitted = [];
  service = new DocumentService({ emit: (message) => emitted.push(message) });
  service.open(root);
  emitted.length = 0;
});

afterEach(() => {
  service.close();
  rmSync(root, { recursive: true, force: true });
});

function mountState() {
  const bridge: Partial<ShellBridge> = {
    onProject: () => {},
    onFiles: (cb) => {
      onFiles = cb;
    },
    onDoc: (cb) => {
      onDoc = cb;
    },
    onFatal: () => {},
    onStats: () => {},
    tree: async () => [],
    history: async () => entries(),
  };
  const testWindow = globalThis as unknown as {
    window: { ombriqueShell: Partial<ShellBridge> };
  };
  testWindow.window = { ombriqueShell: bridge };
  return createShellState();
}

describe("document service to shell edit history", () => {
  it("refreshes the panel from a real historyChanged event", async () => {
    const state = mountState();
    applyColor("#00ff00");
    for (const message of emitted) onDoc(message);

    await vi.waitFor(() => {
      expect(state.getView().editHistory).toHaveLength(1);
    });
    expect(state.getView().editHistory?.[0]?.actor).toBe("agent-1");
    expect(state.getView().canUndo).toBe(false);
  });

  it("refreshes the panel from the files snapshot when doc events are missed", async () => {
    const state = mountState();
    applyColor("#0000ff");
    onFiles({ files: { "pages/home.tsx": "after" } });

    await vi.waitFor(() => {
      expect(state.getView().editHistory).toHaveLength(1);
    });

    applyColor("#ff00ff");
    onFiles({ files: { "pages/home.tsx": "after-2" } });
    await vi.waitFor(() => {
      expect(state.getView().editHistory).toHaveLength(2);
    });
  });
});
