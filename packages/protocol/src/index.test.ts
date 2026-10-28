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
