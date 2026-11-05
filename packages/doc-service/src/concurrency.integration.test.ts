import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Declaration, DocToShell, EditCommand } from "@ombrique/protocol";
import type * as Project from "./project";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentService, TransactionRejectedError } from "./service";

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

const planHooks = vi.hoisted(() => ({
  afterPlan: null as (() => void) | null,
}));

vi.mock("./project", async (importOriginal) => {
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

let root: string;
let service: DocumentService;
let messages: DocToShell[];

function setupProject() {
  root = mkdtempSync(join(tmpdir(), "ombrique-concurrency-"));
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
}

beforeEach(() => {
  planHooks.afterPlan = null;
  setupProject();
  messages = [];
  service = new DocumentService({ emit: (message) => messages.push(message) });
  service.open(root);
});

afterEach(() => {
  service.close();
  planHooks.afterPlan = null;
  rmSync(root, { recursive: true, force: true });
});

function elementAt(path: number[]) {
  const page = service.project.index.pages.find(
    (candidate) => candidate.file === "pages/home.tsx",
  );
  expect(page).toBeDefined();
  let current = page?.root ?? null;
  for (const index of path) current = current?.children[index] ?? null;
  expect(current).not.toBeNull();
  return current;
}

function setStyleCommand(declarations: Declaration[]): EditCommand {
  const target = elementAt([0, 0]);
  if (!target) throw new Error("missing style target");
  return {
    kind: "setStyle",
    target: {
      file: target.ref.file,
      start: target.ref.start,
      end: target.ref.end,
      path: target.path,
    },
    declarations,
  };
}

function fullFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [file, state] of service.project.files) files[file] = state.text;
  return files;
}

function filesAtEntry(
  id: string,
  baseline: Record<string, string>,
): Record<string, string> {
  const files = { ...baseline };
  for (const entry of service.historyEntries()) {
    for (const [file, text] of entry.after) {
      if (text === "") delete files[file];
      else files[file] = text;
    }
    if (entry.id === id) break;
  }
  return files;
}

function commandFailures() {
  return messages.filter(
    (message): message is Extract<DocToShell, { kind: "commandFailed" }> =>
      message.kind === "commandFailed",
  );
}

describe("DocumentService concurrency baseline", () => {
  it("rejects a multi-file batch when an external file appears after planning without writing any file", () => {
    const page = service.project.index.pages.find(
      (candidate) => candidate.file === "pages/home.tsx",
    );
    const hero = page?.root?.children[0];
    if (!hero) throw new Error("missing hero");
    const externalComponent =
      'export function ExternalCard() { return "external"; }\n';
    let modified = false;
    planHooks.afterPlan = () => {
      if (modified) return;
      modified = true;
      mkdirSync(join(root, "components"), { recursive: true });
      writeFileSync(
        join(root, "components/HeroCard.tsx"),
        externalComponent,
        "utf8",
      );
    };

    expect(() =>
      service.apply(
        [{ kind: "createComponent", target: hero.ref, name: "HeroCard" }],
        [],
        "designer",
      ),
    ).toThrow(TransactionRejectedError);

    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toBe(HOME_PAGE);
    expect(readFileSync(join(root, "components/HeroCard.tsx"), "utf8")).toBe(
      externalComponent,
    );
    expect(commandFailures().at(-1)?.message).toContain(
      "components/HeroCard.tsx",
    );
  });

  it("derives transaction origin and history actor from the caller", () => {
    const designer = service.apply(
      [setStyleCommand([["color", "#00ff00"]])],
      [],
    );
    const agent = service.apply(
      [setStyleCommand([["background", "#0000ff"]])],
      [],
      "agent-1",
    );

    expect(designer.origin).toBe("designer");
    expect(designer.actor).toBe("designer");
    expect(agent.origin).toBe("agent");
    expect(agent.actor).toBe("agent-1");
    expect(service.historyEntries().map((entry) => entry.actor)).toEqual([
      "designer",
      "agent-1",
    ]);
  });

  it("keeps adjacent entries from alternating actors separate", () => {
    service.apply(
      [{ kind: "createToken", name: "first", value: "#111111" }],
      [],
      "designer",
    );
    service.apply(
      [{ kind: "setTokenValue", name: "first", value: "#222222" }],
      [],
      "agent-1",
    );
    service.apply(
      [{ kind: "setTokenValue", name: "first", value: "#111111" }],
      [],
      "designer",
    );

    const entries = service.historyEntries();
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.slice(0, 3).map((entry) => entry.actor)).toEqual([
      "designer",
      "agent-1",
      "designer",
    ]);
  });

  it("undoes only designer entries and rolls back to an agent entry by id", () => {
    const baseline = fullFiles();
    service.apply(
      [{ kind: "createToken", name: "designer-token", value: "#111111" }],
      [],
      "designer",
    );
    service.apply(
      [setStyleCommand([["background", "#0000ff"]])],
      [],
      "agent-1",
    );
    const agentEntry = service
      .historyEntries()
      .find((entry) => entry.actor === "agent-1");
    expect(agentEntry).toBeDefined();
    const agentId = agentEntry?.id ?? "";
    const agentPeriodFiles = filesAtEntry(agentId, baseline);
    const agentHome = readFileSync(join(root, "pages/home.tsx"), "utf8");

    service.undo();

    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toBe(agentHome);
    expect(existsSync(join(root, "tokens.css"))).toBe(false);
    expect(service.historyEntry(agentId)?.actor).toBe("agent-1");

    const restored = service.restoreVersion(agentPeriodFiles, "agent-1");
    expect(restored?.origin).toBe("agent");
    expect(restored?.actor).toBe("agent-1");
    expect(service.historyEntry(agentId)).not.toBeNull();
    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toBe(agentHome);
    expect(readFileSync(join(root, "tokens.css"), "utf8")).toContain(
      "--designer-token: #111111;",
    );
  });

  it("preserves stale snapshots, skips stale undo, and still rolls back by id", () => {
    const baseline = fullFiles();
    service.apply([setStyleCommand([["color", "#00ff00"]])], [], "designer");
    const designerEntry = service
      .historyEntries()
      .find((entry) => entry.actor === "designer");
    expect(designerEntry).toBeDefined();
    const designerId = designerEntry?.id ?? "";
    const targetFiles = filesAtEntry(designerId, baseline);
    const external = HOME_PAGE.replace("Ship faster", "External change");
    writeFileSync(join(root, "pages/home.tsx"), external, "utf8");

    expect(service.refreshExternal(["pages/home.tsx"])).toEqual([
      "pages/home.tsx",
    ]);
    expect(service.historyEntry(designerId)?.stale).toBe(true);
    expect(
      service.historyEntry(designerId)?.after.get("pages/home.tsx"),
    ).toContain("#00ff00");
    expect(service.canUndo).toBe(false);
    expect(service.undo()).toBeNull();
    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toBe(external);

    expect(service.restoreVersion(targetFiles)).not.toBeNull();
    expect(service.historyEntry(designerId)?.stale).toBe(true);
    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toContain(
      "#00ff00",
    );
  });

  it("rejects restoreVersion when a touched file was changed externally", () => {
    const baseline = fullFiles();
    service.apply([setStyleCommand([["color", "#00ff00"]])], [], "designer");
    const external = HOME_PAGE.replace("Ship faster", "External change");
    writeFileSync(join(root, "pages/home.tsx"), external, "utf8");
    const styled = service.project.files.get("pages/home.tsx")?.text ?? "";

    expect(() => service.restoreVersion(baseline, "designer")).toThrow(
      TransactionRejectedError,
    );

    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toBe(external);
    expect(service.project.files.get("pages/home.tsx")?.text).toBe(styled);
    expect(commandFailures().at(-1)?.message).toContain("pages/home.tsx");
  });

  it("records restoreVersion as a new actor transaction without dropping later history", () => {
    const baseline = fullFiles();
    service.apply([setStyleCommand([["color", "#00ff00"]])], [], "designer");
    const before = service.historyEntries().map((entry) => entry.id);

    const restored = service.restoreVersion(baseline, "agent-2");
    expect(restored?.origin).toBe("agent");
    expect(restored?.actor).toBe("agent-2");
    const after = service.historyEntries().map((entry) => entry.id);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBeGreaterThan(before.length);
    expect(service.historyEntries().at(-1)?.actor).toBe("agent-2");
  });

  it("accepts consecutive writes from different actors after self writes", () => {
    service.apply(
      [{ kind: "createToken", name: "brand", value: "#111111" }],
      [],
      "designer",
    );
    const transaction = service.apply(
      [{ kind: "setTokenValue", name: "brand", value: "#222222" }],
      [],
      "agent-1",
    );

    expect(transaction.origin).toBe("agent");
    expect(readFileSync(join(root, "tokens.css"), "utf8")).toContain(
      "--brand: #222222;",
    );
  });

  it("serializes reentrant writes from different actors", () => {
    service.close();
    let reentered = false;
    const origins: string[] = [];
    let localService: DocumentService | undefined;
    localService = new DocumentService({
      emit: (message) => {
        messages.push(message);
        if (message.kind === "transactionApplied") {
          origins.push(message.transaction.origin);
          if (!reentered) {
            reentered = true;
            localService?.apply(
              [{ kind: "createToken", name: "agent-token", value: "#222222" }],
              [],
              "agent-1",
            );
          }
        }
      },
    });
    localService.open(root);

    localService.apply(
      [{ kind: "createToken", name: "designer-token", value: "#111111" }],
      [],
      "designer",
    );

    expect(origins).toEqual(["designer", "agent"]);
    const tokens = readFileSync(join(root, "tokens.css"), "utf8");
    expect(tokens).toContain("--designer-token: #111111;");
    expect(tokens).toContain("--agent-token: #222222;");
    localService.close();
  });
});
