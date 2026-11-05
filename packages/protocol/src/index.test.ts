import { describe, expect, it } from "vitest";
import {
  agentClientToHostSchema,
  agentHostToClientSchema,
  agentSessionSchema,
  appliedTransactionSchema,
  docToShellSchema,
  editCommandSchema,
  historySnapshotEntrySchema,
  manifestSchema,
  shellToDocSchema,
} from "./index";

describe("editCommandSchema", () => {
  it("accepts a setStyle command with inline declarations", () => {
    const cmd = {
      kind: "setStyle",
      target: { file: "pages/home.tsx", start: 120, end: 180 },
      declarations: [
        ["background", "#ff0000"],
        ["opacity", null],
      ],
    };
    expect(editCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("rejects a setStyle command without declarations", () => {
    expect(
      editCommandSchema.safeParse({
        kind: "setStyle",
        target: { file: "pages/home.tsx", start: 0, end: 1 },
        declarations: [],
      }).success,
    ).toBe(false);
  });

  it("accepts createNodes with a frame spec and null parent", () => {
    const cmd = {
      kind: "createNodes",
      parent: null,
      pageFile: "pages/home.tsx",
      index: 0,
      specs: [
        { kind: "frame", name: "Hero", x: 0, y: 0, width: 1440, height: 900 },
      ],
    };
    expect(editCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("accepts groupNodes with targets, parent and name", () => {
    const cmd = {
      kind: "groupNodes",
      targets: [{ file: "pages/home.tsx", start: 100, end: 200, path: [0, 0] }],
      parent: null,
      pageFile: "pages/home.tsx",
      index: 0,
      name: "Card Group",
    };
    expect(editCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("accepts ungroupNode and rejects empty groupNodes targets", () => {
    expect(
      editCommandSchema.parse({
        kind: "ungroupNode",
        target: { file: "pages/home.tsx", start: 0, end: 10, path: [0] },
      }).kind,
    ).toBe("ungroupNode");
    expect(
      editCommandSchema.safeParse({
        kind: "groupNodes",
        targets: [],
        parent: null,
        pageFile: "pages/home.tsx",
        index: 0,
        name: "G",
      }).success,
    ).toBe(false);
  });

  it("accepts duplicateNode with a target and offset", () => {
    const cmd = {
      kind: "duplicateNode",
      target: { file: "pages/home.tsx", start: 120, end: 180, path: [0, 1] },
      dx: 20,
      dy: 20,
    };
    expect(editCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("rejects duplicateNode without a target", () => {
    expect(
      editCommandSchema.safeParse({ kind: "duplicateNode", dx: 20, dy: 20 })
        .success,
    ).toBe(false);
  });

  it("accepts token mode commands and mode-specific values", () => {
    for (const command of [
      { kind: "setTokenValue", name: "--bg", value: "black", mode: "Dark" },
      { kind: "addTokenMode", name: "Compact mode" },
      { kind: "renameTokenMode", name: "Dark", newName: "Night" },
      { kind: "deleteTokenMode", name: "Night" },
    ])
      expect(editCommandSchema.parse(command)).toEqual(command);
  });

  it("rejects empty or selector-breaking token mode names", () => {
    for (const name of ["", " ", 'dark"] {}', "dark\\mode"]) {
      expect(
        editCommandSchema.safeParse({ kind: "addTokenMode", name }).success,
      ).toBe(false);
      expect(
        editCommandSchema.safeParse({
          kind: "setTokenValue",
          name: "--bg",
          value: "black",
          mode: name,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts an icon node spec with stroke or fill icon kind", () => {
    const command = {
      kind: "createNodes",
      parent: null,
      pageFile: "pages/home.tsx",
      index: 0,
      specs: [
        {
          kind: "icon",
          name: "Arrow",
          x: 0,
          y: 0,
          width: 24,
          height: 24,
          iconSet: "lucide",
          iconName: "arrow-right",
          iconKind: "stroke",
          strokeWidth: 2,
          fill: "none",
          opacity: 0.8,
        },
      ],
    };
    expect(editCommandSchema.parse(command)).toEqual(command);
    expect(
      editCommandSchema.safeParse({
        ...command,
        specs: [{ ...command.specs[0], iconKind: "both" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a static shader node spec", () => {
    const command = {
      kind: "createNodes",
      parent: null,
      pageFile: "pages/shader.tsx",
      index: 0,
      specs: [
        {
          kind: "shader",
          name: "Mesh",
          x: 64,
          y: 176,
          width: 720,
          height: 420,
          src: "shaders/mesh-gradient.glsl",
          time: 0,
          radius: 28,
        },
      ],
    };
    expect(editCommandSchema.parse(command)).toEqual(command);
    const [spec] = command.specs;
    if (!spec) throw new Error("missing spec");
    expect(
      editCommandSchema.safeParse({
        ...command,
        specs: [{ ...spec, src: "" }],
      }).success,
    ).toBe(false);
    expect(
      editCommandSchema.safeParse({
        ...command,
        specs: [{ ...spec, radius: -1 }],
      }).success,
    ).toBe(false);
    expect(
      editCommandSchema.safeParse({
        ...command,
        specs: [{ ...spec, kind: "shader-layer" }],
      }).success,
    ).toBe(false);
  });
});

describe("manifestSchema", () => {
  it("round-trips a manifest", () => {
    const manifest = {
      formatVersion: 1,
      pages: [{ id: "p1", name: "Home", file: "pages/home.tsx" }],
    };
    expect(manifestSchema.parse(manifest)).toEqual(manifest);
    expect(
      manifestSchema.safeParse({ formatVersion: 2, pages: [] }).success,
    ).toBe(false);
  });
});

describe("ipc envelopes", () => {
  it("validates shell to doc openProject", () => {
    expect(
      shellToDocSchema.parse({
        kind: "openProject",
        path: "/tmp/demo.ombrique",
      }).kind,
    ).toBe("openProject");
  });

  it("validates doc to shell transactionApplied", () => {
    const msg = {
      kind: "transactionApplied",
      transaction: {
        id: "t1",
        changedFiles: ["pages/home.tsx"],
        versions: { "pages/home.tsx": "abc" },
        origin: "designer",
      },
    };
    expect(appliedTransactionSchema.parse(msg.transaction).id).toBe("t1");
    expect(docToShellSchema.parse(msg).kind).toBe("transactionApplied");
  });

  it("accepts an optional actor on applyCommands", () => {
    const message = {
      kind: "applyCommands",
      commands: [{ kind: "addPage", name: "Home" }],
      baseVersions: [],
    };
    expect(shellToDocSchema.parse(message)).not.toHaveProperty("actor");
    expect(
      shellToDocSchema.parse({ ...message, actor: "agent-1" }),
    ).toHaveProperty("actor", "agent-1");
    expect(shellToDocSchema.safeParse({ ...message, actor: "" }).success).toBe(
      false,
    );
  });

  it("validates agent transactions with an actor", () => {
    const transaction = {
      id: "t2",
      changedFiles: ["pages/home.tsx"],
      versions: { "pages/home.tsx": "abc" },
      origin: "agent",
      actor: "agent-1",
    };
    expect(appliedTransactionSchema.parse(transaction).actor).toBe("agent-1");
    expect(
      docToShellSchema.parse({ kind: "transactionApplied", transaction }).kind,
    ).toBe("transactionApplied");
    expect(
      appliedTransactionSchema.safeParse({ ...transaction, origin: "external" })
        .success,
    ).toBe(true);
    expect(
      appliedTransactionSchema.safeParse({ ...transaction, origin: "system" })
        .success,
    ).toBe(false);
    expect(
      appliedTransactionSchema.safeParse({ ...transaction, actor: "" }).success,
    ).toBe(false);
  });

  it("rejects unknown message kinds", () => {
    expect(shellToDocSchema.safeParse({ kind: "nope" }).success).toBe(false);
  });
});

describe("agent transport envelopes", () => {
  it("validates agent client messages", () => {
    const shell = {
      kind: "shell",
      message: {
        kind: "applyCommands",
        commands: [{ kind: "createToken", name: "x", value: "#ffffff" }],
        baseVersions: [],
      },
    };
    expect(agentClientToHostSchema.parse(shell).kind).toBe("shell");
    expect(
      agentClientToHostSchema.parse({ kind: "initialize", client: "probe" })
        .kind,
    ).toBe("initialize");
    expect(
      agentClientToHostSchema.parse({
        kind: "query",
        id: "q1",
        request: { type: "versions" },
      }).kind,
    ).toBe("query");
    expect(
      agentClientToHostSchema.parse({
        kind: "query",
        id: "q2",
        request: {
          type: "select",
          targets: [{ file: "pages/home.tsx", path: [0, 0] }],
        },
      }).kind,
    ).toBe("query");
    expect(
      agentClientToHostSchema.parse({
        kind: "query",
        id: "q3",
        request: { type: "screenshot" },
      }).kind,
    ).toBe("query");
    expect(
      agentClientToHostSchema.parse({
        kind: "query",
        id: "q4",
        request: {
          type: "export",
          request: {
            file: "pages/home.tsx",
            name: "home",
            settings: [
              {
                id: "s1",
                format: "png",
                scale: { type: "scale", value: 2 },
                suffix: "",
              },
            ],
          },
        },
      }).kind,
    ).toBe("query");
    expect(
      agentClientToHostSchema.parse({
        kind: "activity",
        targets: [{ file: "pages/home.tsx", path: [0, 0] }],
      }).kind,
    ).toBe("activity");
    expect(
      agentClientToHostSchema.safeParse({
        kind: "shell",
        message: { kind: "nope" },
      }).success,
    ).toBe(false);
  });

  it("validates agent host messages", () => {
    const session = { id: "s1", actor: "agent-1", color: "#ff6b6b" };
    expect(agentSessionSchema.parse(session).actor).toBe("agent-1");
    expect(
      agentHostToClientSchema.parse({
        kind: "connected",
        session,
        generation: 1,
        projectOpen: true,
      }).kind,
    ).toBe("connected");
    expect(
      agentHostToClientSchema.parse({
        kind: "projectClosed",
        generation: 2,
        reason: "switch",
      }),
    ).toHaveProperty("reason", "switch");
    expect(
      agentHostToClientSchema.parse({
        kind: "doc",
        message: {
          kind: "transactionApplied",
          transaction: {
            id: "t1",
            changedFiles: [],
            versions: {},
            origin: "agent",
            actor: "agent-1",
          },
        },
      }).kind,
    ).toBe("doc");
    expect(agentHostToClientSchema.safeParse({ kind: "nope" }).success).toBe(
      false,
    );
  });

  it("validates history snapshot entries", () => {
    const entry = {
      id: "h1",
      actor: "agent-1",
      stale: false,
      createdAt: 1,
      files: ["pages/home.tsx"],
      before: { "pages/home.tsx": "old" },
      after: { "pages/home.tsx": "new" },
    };
    expect(historySnapshotEntrySchema.parse(entry).actor).toBe("agent-1");
    expect(
      historySnapshotEntrySchema.safeParse({ ...entry, stale: "no" }).success,
    ).toBe(false);
  });
});
