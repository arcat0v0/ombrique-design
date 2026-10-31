import { describe, expect, it } from "vitest";
import { createShellState, shouldRouteToAttrs, toSummary } from "./state";

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
  it("routes Frame prototype props to setAttrs even when missing from source", () => {
    for (const key of [
      "onClickNavigate",
      "cursor",
      "transitionType",
      "transitionDuration",
      "onHoverStyle",
    ]) {
      expect(shouldRouteToAttrs(key, false, "Frame")).toBe(true);
    }
    expect(shouldRouteToAttrs("onClickNavigate", false, "frame")).toBe(true);
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

  it("routes new shape appearance props to setAttrs", () => {
    for (const tag of ["Rect", "Ellipse", "Star"]) {
      expect(shouldRouteToAttrs("fill", false, tag)).toBe(true);
      expect(shouldRouteToAttrs("stroke", false, tag)).toBe(true);
      expect(shouldRouteToAttrs("strokeWidth", false, tag)).toBe(true);
      expect(shouldRouteToAttrs("opacity", false, tag)).toBe(true);
    }
    expect(shouldRouteToAttrs("fill", false, "div")).toBe(false);
  });
});

describe("toSummary with sharedStyles", () => {
  it("includes sharedStyles as source: shared rows with file, span, selector, and ruleLabel", () => {
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
    expect(shared?.file).toBe("styles.scss");
    expect(shared?.start).toBe(22);
    expect(shared?.end).toBe(29);
    expect(shared?.selector).toBe(".card");
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
    const state = createShellState();

    await state.actions.createToken?.("bad-tok", "val");
    expect(state.getView().notice).toContain("创建 Token 失败");

    await state.actions.setToken?.("bad-tok", "new-val");
    expect(state.getView().notice).toContain("更新 Token 失败");
  });

  it("loads mode columns, forwards mode values, and sends mode mutations", async () => {
    const commands: SentCommand[] = [];
    const setValues: Array<[string, string, string | undefined]> = [];
    installBridge({
      listTokens: async () => [
        {
          name: "--bg",
          value: "white",
          values: { default: "white", dark: "black" },
          file: "tokens.css",
          span: { start: 0, end: 10 },
        },
      ],
      listTokenModes: async () => [
        { name: "default", isDefault: true },
        { name: "dark", isDefault: false },
      ],
      setToken: async (name, value, mode) => {
        setValues.push([name, value, mode]);
        return true;
      },
      send: async (message) => {
        commands.push(message as SentCommand);
        return true;
      },
      versions: async () => ({}),
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    });
    const state = createShellState();
    await state.actions.refreshTokens?.();
    expect(state.getView().tokenModes?.map((mode) => mode.name)).toEqual([
      "default",
      "dark",
    ]);
    await state.actions.setToken?.("--bg", "#111", "dark");
    expect(setValues).toEqual([["--bg", "#111", "dark"]]);
    await state.actions.addTokenMode?.("Compact");
    await state.actions.renameTokenMode?.("dark", "Night");
    await state.actions.deleteTokenMode?.("Night");
    expect(commands.map((message) => message.commands?.[0])).toEqual([
      { kind: "addTokenMode", name: "Compact" },
      { kind: "renameTokenMode", name: "dark", newName: "Night" },
      { kind: "deleteTokenMode", name: "Night" },
    ]);
  });
});

describe("toSummary component metadata", () => {
  it("populates kind, componentName, variantAxes and variantProps", () => {
    const summary = toSummary({
      ref: { file: "pages/home.tsx", start: 0, end: 10 },
      path: [0, 0],
      tag: "Button",
      kind: "component",
      componentName: "Button",
      generated: false,
      name: "Button",
      hidden: false,
      locked: false,
      text: "",
      style: [],
      props: [{ key: "size", value: "large", dynamic: false }],
      attrs: [],
      variantAxes: [{ name: "size", values: ["small", "medium", "large"] }],
    });
    expect(summary.kind).toBe("component");
    expect(summary.componentName).toBe("Button");
    expect(summary.variantAxes).toEqual([
      { name: "size", values: ["small", "medium", "large"] },
    ]);
    expect(summary.variantProps).toEqual({ size: "large" });
  });
});

describe("insertImage in createShellState", () => {
  it("imports image via bridge and sends createNodes", async () => {
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
    const state = createShellState();

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

describe("reparentLayer and reorderLayer in createShellState", () => {
  function baseBridge(): Partial<ShellBridge> {
    return {
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
      tree: async () => [],
    };
  }

  it("reparentLayer sends reparent command with resolved refs", async () => {
    const sentCommands: SentCommand[] = [];
    const { promise: sentPromise, resolve: resolveSent } =
      Promise.withResolvers<void>();
    const mockBridge = {
      ...baseBridge(),
      send: async (msg: unknown) => {
        sentCommands.push(msg as SentCommand);
        resolveSent();
        return true;
      },
      versions: async () => ({}),
      resolveNode: async (_file: string, path: number[]) => ({
        ref: {
          file: "pages/home.tsx",
          start: (path[0] ?? 0) * 10,
          end: (path[0] ?? 0) * 10 + 20,
        },
        path,
        tag: "frame",
        kind: "frame",
        generated: false,
        name: `Node ${path.join("/")}`,
        hidden: false,
        locked: false,
        text: "",
        style: [],
        attrs: [],
      }),
    };
    installBridge(mockBridge);
    const state = createShellState();
    Object.assign(state.getView(), {
      activePageId: "home",
      manifest: {
        formatVersion: 1,
        pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
      },
    });

    void state.actions.reparentLayer?.("0/1", "0", 2);
    await sentPromise;

    const reparentMsg = sentCommands[0] as unknown as {
      commands?: Array<{
        kind: string;
        target: { file: string; start: number; end: number; path: number[] };
        parent: {
          file: string;
          start: number;
          end: number;
          path: number[];
        } | null;
        pageFile: string;
        index: number;
      }>;
    };
    expect(reparentMsg.commands?.[0]?.kind).toBe("reparent");
    expect(reparentMsg.commands?.[0]?.target?.path).toEqual([0, 1]);
    expect(reparentMsg.commands?.[0]?.parent?.path).toEqual([0]);
    expect(reparentMsg.commands?.[0]?.pageFile).toBe("pages/home.tsx");
    expect(reparentMsg.commands?.[0]?.index).toBe(2);
  });

  it("reorderLayer calculates target index and sends reparent command", async () => {
    const sentCommands: SentCommand[] = [];
    const { promise: sentPromise, resolve: resolveSent } =
      Promise.withResolvers<void>();
    const mockBridge = {
      ...baseBridge(),
      send: async (msg: unknown) => {
        sentCommands.push(msg as SentCommand);
        resolveSent();
        return true;
      },
      versions: async () => ({}),
      resolveNode: async (_file: string, path: number[]) => ({
        ref: {
          file: "pages/home.tsx",
          start: (path[path.length - 1] ?? 0) * 10,
          end: (path[path.length - 1] ?? 0) * 10 + 20,
        },
        path,
        tag: "frame",
        kind: "frame",
        generated: false,
        name: `Node ${path.join("/")}`,
        hidden: false,
        locked: false,
        text: "",
        style: [],
        attrs: [],
      }),
    };
    installBridge(mockBridge);
    const state = createShellState();
    Object.assign(state.getView(), {
      activePageId: "home",
      manifest: {
        formatVersion: 1,
        pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
      },
      layers: [
        {
          id: "0",
          name: "Root",
          tag: "frame",
          kind: "frame",
          depth: 0,
          hidden: false,
          locked: false,
          generated: false,
          children: [
            {
              id: "0/0",
              name: "Child 0",
              tag: "frame",
              kind: "frame",
              depth: 1,
              hidden: false,
              locked: false,
              generated: false,
              children: [],
            },
            {
              id: "0/1",
              name: "Child 1",
              tag: "frame",
              kind: "frame",
              depth: 1,
              hidden: false,
              locked: false,
              generated: false,
              children: [],
            },
            {
              id: "0/2",
              name: "Child 2",
              tag: "frame",
              kind: "frame",
              depth: 1,
              hidden: false,
              locked: false,
              generated: false,
              children: [],
            },
          ],
        },
      ],
    });

    void state.actions.reorderLayer?.("0/2", "0/0", "after");
    await sentPromise;

    const reorderMsg = sentCommands[0] as unknown as {
      commands?: Array<{
        kind: string;
        target: { file: string; start: number; end: number; path: number[] };
        parent: {
          file: string;
          start: number;
          end: number;
          path: number[];
        } | null;
        index: number;
      }>;
    };
    expect(reorderMsg.commands?.[0]?.kind).toBe("reparent");
    expect(reorderMsg.commands?.[0]?.target?.path).toEqual([0, 2]);
    expect(reorderMsg.commands?.[0]?.parent?.path).toEqual([0]);
    expect(reorderMsg.commands?.[0]?.index).toBe(1);
  });
});
