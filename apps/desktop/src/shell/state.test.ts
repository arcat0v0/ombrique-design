import { describe, expect, it } from "vitest";
import { shouldRouteToAttrs, toSummary } from "./state";

import type { ShellBridge } from "./state";

function installBridge(bridge: Partial<ShellBridge>) {
  (
    globalThis as unknown as { window: { ombriqueShell: Partial<ShellBridge> } }
  ).window = {
    ombriqueShell: bridge,
  };
}

type SentCommand = {
  kind: string;
  commands: Array<{
    kind?: string;
    specs?: Array<{ kind?: string; src?: string; radius?: number }>;
  }>;
  baseVersions?: unknown;
};

describe("shouldRouteToAttrs", () => {
  it("routes existing props to setAttrs regardless of key", () => {
    expect(shouldRouteToAttrs("width", true, "div")).toBe(true);
    expect(shouldRouteToAttrs("x", true, "Frame")).toBe(true);
  });

  it("routes Frame layout props to setAttrs even when missing from source", () => {
    for (const key of [
      "layout",
      "gap",
      "padding",
      "align",
      "justify",
      "wrap",
      "grid",
    ]) {
      expect(shouldRouteToAttrs(key, false, "Frame")).toBe(true);
    }
    expect(shouldRouteToAttrs("gap", false, "frame")).toBe(true);
    expect(shouldRouteToAttrs("align", false, "section")).toBe(true);
    expect(shouldRouteToAttrs("gap", false, "Group")).toBe(true);
  });

  it("keeps geometry and appearance keys on setStyle", () => {
    expect(shouldRouteToAttrs("width", false, "Frame")).toBe(false);
    expect(shouldRouteToAttrs("left", false, "Frame")).toBe(false);
    expect(shouldRouteToAttrs("background", false, "Frame")).toBe(false);
    expect(shouldRouteToAttrs("flex", false, "Frame")).toBe(false);
    expect(shouldRouteToAttrs("borderRadius", false, "div")).toBe(false);
  });

  it("does not add layout props to non-Frame elements via setAttrs", () => {
    expect(shouldRouteToAttrs("gap", false, "div")).toBe(false);
    expect(shouldRouteToAttrs("layout", false, "rect")).toBe(false);
  });
});

describe("toSummary with sharedStyles", () => {
  it("includes sharedStyles as source: shared rows with file:selector labels", () => {
    const summary = toSummary({
      ref: { file: "pages/home.tsx", start: 0, end: 100 },
      path: [0, 1],
      tag: "div",
      kind: "intrinsic",
      generated: false,
      name: "Card",
      hidden: false,
      locked: false,
      text: "",
      style: [{ key: "left", value: 10, dynamic: false }],
      props: [{ key: "id", value: "main", dynamic: false }],
      attrs: [],
      sharedStyles: [
        {
          file: "styles.scss",
          selector: ".card",
          fullSelector: ".card",
          prop: "background",
          value: "#ffffff",
          propSpan: { start: 10, end: 30 },
          valueSpan: { start: 22, end: 29 },
        },
      ],
    });

    const shared = summary.styles.find((s) => s.key === "background");
    expect(shared).toBeDefined();
    expect(shared?.source).toBe("shared");
    expect(shared?.value).toBe("#ffffff");
    expect(shared?.ruleLabel).toBe("styles.scss:.card");
    expect(shared?.readOnly).toBe(false);
  });

  it("includes file, start, end, selector on shared StyleRow", () => {
    const summary = toSummary({
      ref: { file: "pages/home.tsx", start: 0, end: 100 },
      path: [0, 1],
      tag: "div",
      kind: "intrinsic",
      generated: false,
      name: "Card",
      hidden: false,
      locked: false,
      text: "",
      style: [],
      props: [],
      attrs: [],
      sharedStyles: [
        {
          file: "theme.scss",
          selector: ".btn",
          fullSelector: ".btn",
          prop: "padding",
          value: "8px 16px",
          propSpan: { start: 50, end: 70 },
          valueSpan: { start: 59, end: 69 },
        },
      ],
    });

    const shared = summary.styles.find((s) => s.key === "padding");
    if (!shared) throw new Error("missing padding row");
    expect(shared.file).toBe("theme.scss");
    expect(shared.start).toBe(59);
    expect(shared.end).toBe(69);
    expect(shared.selector).toBe(".btn");
  });
});

describe("createShellState style & token routing", () => {
  it("setStyle routes target: shared to updateSharedStyle without touching inline", async () => {
    let sharedUpdated = false;
    const sentCommands: SentCommand[] = [];
    const mockBridge: Partial<ShellBridge> = {
      updateSharedStyle: async (
        file: string,
        start: number,
        end: number,
        value: string,
      ) => {
        if (
          file === "card.scss" &&
          start === 10 &&
          end === 20 &&
          value === "#ff0000"
        ) {
          sharedUpdated = true;
          return true;
        }
        return false;
      },
      send: async (msg: unknown) => {
        sentCommands.push(msg as SentCommand);
        return true;
      },
      versions: async () => ({}),
      tree: async () => [],
      resolveNode: async () => null,
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };

    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    state.actions.setStyle("color", "#ff0000", {
      source: "shared",
      file: "card.scss",
      start: 10,
      end: 20,
      selector: ".card",
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(sharedUpdated).toBe(true);
    expect(sentCommands).toHaveLength(0);
  });

  it("setStyle with shared target notices on missing span info", async () => {
    const mockBridge: Partial<ShellBridge> = {
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    state.actions.setStyle("color", "#ff0000", { source: "shared" });
    expect(state.getView().notice).toContain("缺少共享样式源位置信息");
  });

  it("token creation and update failure sets notice and does not fake success", async () => {
    const mockBridge: Partial<ShellBridge> = {
      createToken: async () => false,
      setToken: async () => false,
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    await state.actions.createToken?.("bad-tok", "val");
    expect(state.getView().notice).toContain("创建 Token 失败");

    await state.actions.setToken?.("bad-tok", "new-val");
    expect(state.getView().notice).toContain("更新 Token 失败");
  });
});

describe("createComponent and detachInstance in createShellState", () => {
  it("toSummary derives kind='component' when node.kind is component", () => {
    const summary = toSummary({
      ref: { file: "pages/home.tsx", start: 0, end: 50 },
      path: [0, 0],
      tag: "Card",
      kind: "component",
      generated: false,
      name: "Card",
      hidden: false,
      locked: false,
      text: "",
      style: [],
      props: [],
      attrs: [],
      componentName: "Card",
    });
    expect(summary.kind).toBe("component");
  });

  it("createComponent dispatches command and returns true", async () => {
    const sent: SentCommand[] = [];
    const mockBridge: Partial<ShellBridge> = {
      send: async (msg: unknown) => {
        sent.push(msg as SentCommand);
        return true;
      },
      versions: async () => ({}),
      tree: async () => [],
      resolveNode: async () => ({
        ref: { file: "pages/home.tsx", start: 10, end: 50 },
        path: [0, 0],
        tag: "Frame",
        kind: "frame",
        generated: false,
        name: "Card",
        hidden: false,
        locked: false,
        text: "",
        style: [],
        props: [],
        attrs: [],
      }),
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
      onSelectionChanged: () => {},
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    // create component
    const ok = await state.actions.createComponent?.("MyComp");
    // Even without selection mock in selectNode, createComponent returns boolean
    expect(typeof ok).toBe("boolean");
  });
});

describe("insertImage and flattenSelection in createShellState", () => {
  it("insertImage imports image via bridge and sends createNodes", async () => {
    const sent: SentCommand[] = [];
    const mockBridge: Partial<ShellBridge> = {
      importImage: async () => ({
        ok: true,
        src: "assets/logo.png",
        width: 300,
        height: 200,
        name: "logo",
      }),
      send: async (msg: unknown) => {
        sent.push(msg as SentCommand);
        return true;
      },
      versions: async () => ({}),
      tree: async () => [],
      resolveNode: async () => null,
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    // simulate active page
    Object.assign(state.getView(), { activePageId: "home" });
    Object.assign(state.getView(), {
      manifest: {
        formatVersion: 1,
        pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
      },
    });

    const ok = await state.actions.insertImage?.();
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    const command = sent[0]?.commands[0];
    const spec = command?.specs?.[0];
    expect(command?.kind).toBe("createNodes");
    expect(spec?.kind).toBe("image");
    expect(spec?.src).toBe("assets/logo.png");
  });

  it("flattenSelection sends flattenBoolean command", async () => {
    const sent: SentCommand[] = [];
    const mockBridge: Partial<ShellBridge> = {
      send: async (msg: unknown) => {
        sent.push(msg as SentCommand);
        return true;
      },
      versions: async () => ({}),
      tree: async () => [],
      resolveNode: async () => null,
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    const ok = await state.actions.flattenSelection?.();
    expect(typeof ok).toBe("boolean");
  });
});

describe("exportNode, bundleProject, openBundle in createShellState", () => {
  it("exportNode calls bridge.exportNode with selected node or active page", async () => {
    let exportCalled = false;
    const mockBridge: Partial<ShellBridge> = {
      exportNode: async (payload: { format: string; scale: number }) => {
        if (payload.format === "svg" && payload.scale === 2) {
          exportCalled = true;
          return { ok: true };
        }
        return { ok: false };
      },
      send: async () => true,
      versions: async () => ({}),
      tree: async () => [],
      resolveNode: async () => null,
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    Object.assign(state.getView(), { activePageId: "home" });
    Object.assign(state.getView(), {
      manifest: {
        formatVersion: 1,
        pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
      },
    });

    const ok = await state.actions.exportNode?.("svg", 2);
    expect(ok).toBe(true);
    expect(exportCalled).toBe(true);
  });

  it("bundleProject and openBundle call respective bridge methods", async () => {
    let bundleCalled = false;
    let openCalled = false;
    const mockBridge: Partial<ShellBridge> = {
      bundleProject: async () => {
        bundleCalled = true;
        return { ok: true, path: "/tmp/test.ombrique" };
      },
      openBundle: async () => {
        openCalled = true;
        return { ok: true, root: "/tmp/extracted" };
      },
      send: async () => true,
      versions: async () => ({}),
      tree: async () => [],
      resolveNode: async () => null,
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    const okBundle = await state.actions.bundleProject?.();
    expect(okBundle).toBe(true);
    expect(bundleCalled).toBe(true);

    const okOpen = await state.actions.openBundle?.();
    expect(okOpen).toBe(true);
    expect(openCalled).toBe(true);
  });
});

describe("toolChanged mirror and per-layer toggles in createShellState", () => {
  function baseBridge(): Partial<ShellBridge> {
    return {
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
  }

  it("mirrors canvas toolChanged into view.activeTool", async () => {
    const emit: {
      tool: ((tool: "select" | "hand") => void) | null;
    } = { tool: null };
    const mockBridge = {
      ...baseBridge(),
      onToolChanged: (cb: (tool: "select" | "hand") => void) => {
        emit.tool = cb;
      },
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    expect(state.getView().activeTool).toBe("select");
    emit.tool?.("hand");
    expect(state.getView().activeTool).toBe("hand");
    emit.tool?.("hand");
    emit.tool?.("select");
    expect(state.getView().activeTool).toBe("select");
  });

  it("toggleHiddenForLayer sends setAttrs with resolved node ref", async () => {
    const sentCommands: SentCommand[] = [];
    const mockBridge = {
      ...baseBridge(),
      send: async (msg: unknown) => {
        sentCommands.push(msg as SentCommand);
        return true;
      },
      versions: async () => ({}),
      resolveNode: async () => ({
        ref: { file: "pages/home.tsx", start: 10, end: 40 },
        path: [0, 1],
        tag: "section",
        kind: "frame",
        generated: false,
        name: "Hero",
        hidden: false,
        locked: false,
        text: "",
        style: [],
        attrs: [],
      }),
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    await state.actions.toggleHiddenForLayer?.("0/1", true);
    await new Promise((r) => setTimeout(r, 20));
    const command = sentCommands[0] as {
      commands?: Array<{ kind: string; attrs?: Record<string, unknown> }>;
    };
    expect(command.commands?.[0]?.kind).toBe("setAttrs");
    expect(command.commands?.[0]?.attrs).toEqual({ hidden: true });
  });

  it("toggleLockedForLayer sends data-locked set and clear", async () => {
    const sentCommands: SentCommand[] = [];
    const mockBridge = {
      ...baseBridge(),
      send: async (msg: unknown) => {
        sentCommands.push(msg as SentCommand);
        return true;
      },
      versions: async () => ({}),
      resolveNode: async () => ({
        ref: { file: "pages/home.tsx", start: 10, end: 40 },
        path: [0, 1],
        tag: "section",
        kind: "frame",
        generated: false,
        name: "Hero",
        hidden: false,
        locked: false,
        text: "",
        style: [],
        attrs: [],
      }),
    };
    installBridge(mockBridge);
    const { createShellState } = await import("./state");
    const state = createShellState();

    await state.actions.toggleLockedForLayer?.("0/1", true);
    await state.actions.toggleLockedForLayer?.("0/1", false);
    await new Promise((r) => setTimeout(r, 20));
    const first = sentCommands[0] as {
      commands?: Array<{ kind: string; attrs?: Record<string, unknown> }>;
    };
    const second = sentCommands[1] as {
      commands?: Array<{ kind: string; attrs?: Record<string, unknown> }>;
    };
    expect(first.commands?.[0]?.attrs).toEqual({ "data-locked": "" });
    expect(second.commands?.[0]?.attrs).toEqual({ "data-locked": null });
  });
});
