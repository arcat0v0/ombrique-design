import { describe, expect, it } from "vitest";
import {
  appliedTransactionSchema,
  docToShellSchema,
  editCommandSchema,
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

  it("rejects unknown message kinds", () => {
    expect(shellToDocSchema.safeParse({ kind: "nope" }).success).toBe(false);
  });
});
