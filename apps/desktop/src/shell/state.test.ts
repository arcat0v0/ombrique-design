import type { HistorySnapshotEntry } from "@ombrique/protocol";
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
  it("serializes sendCommands so version reads never interleave", async () => {
    const events: string[] = [];
    const sentCommands: SentCommand[] = [];
    const gate = Promise.withResolvers<void>();
    const resolved = Promise.withResolvers<void>();
    const secondSend = Promise.withResolvers<void>();
    let sends = 0;
    const selectionChanged: { cb: ((payload: unknown) => void) | null } = {
      cb: null,
    };
    installBridge({
      versions: async () => {
        events.push("versions");
        await gate.promise;
        return { "pages/home.tsx": "v1" };
      },
      send: async (message) => {
        events.push("send");
        sentCommands.push(message as SentCommand);
        sends += 1;
        if (sends >= 2) secondSend.resolve();
        return true;
      },
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
      onSelectionChanged: (cb) => {
        selectionChanged.cb = cb;
      },
      resolveNode: async () => {
        resolved.resolve();
        return {
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
        };
      },
    });
    const state = createShellState();
    selectionChanged.cb?.({ file: "pages/home.tsx", path: [0, 1] });
    await resolved.promise;
    state.actions.setName("A");
    state.actions.setName("B");
    gate.resolve();
    await secondSend.promise;
    expect(events).toEqual(["versions", "send", "versions", "send"]);
    expect(sentCommands).toHaveLength(2);
  });
  it("sets notice when the doc host rejects a transaction", async () => {
    const resolved = Promise.withResolvers<void>();
    const settled = Promise.withResolvers<void>();
    const selectionChanged: { cb: ((payload: unknown) => void) | null } = {
      cb: null,
    };
    installBridge({
      versions: async () => ({ "pages/home.tsx": "v1" }),
      send: async () => {
        settled.resolve();
        throw new Error("command could not be applied to the current sources");
      },
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
      onSelectionChanged: (cb) => {
        selectionChanged.cb = cb;
      },
      resolveNode: async () => {
        resolved.resolve();
        return {
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
        };
      },
    });
    const state = createShellState();
    selectionChanged.cb?.({ file: "pages/home.tsx", path: [0, 1] });
    await resolved.promise;
    state.actions.setName("A");
    await settled.promise;
    for (let ticks = 0; state.getView().busy && ticks < 100; ticks += 1) {
      await queueMicrotask;
    }
    expect(state.getView().notice).toBe(
      "command could not be applied to the current sources",
    );
    expect(state.getView().busy).toBe(false);
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
describe("workspace and recent project actions", () => {
  function baseBridge(): Partial<ShellBridge> {
    return {
      onProject: () => {},
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
    };
  }

  async function waitFor(predicate: () => boolean): Promise<void> {
    for (let tick = 0; tick < 100; tick += 1) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not met in time");
  }

  const project = {
    root: "/work/pricing-redesign",
    name: "pricing-redesign",
    lastOpenedAt: new Date().toISOString(),
    pageCount: 3,
    exists: true,
    thumbnail: null,
  };

  it("opens a recent project and refreshes the local history", async () => {
    const opened: string[] = [];
    const { promise: openCalled, resolve } = Promise.withResolvers<void>();
    installBridge({
      ...baseBridge(),
      openPath: async (path: string) => {
        opened.push(path);
        resolve();
        return path;
      },
      listRecentProjects: async () => [project],
    });
    const state = createShellState();
    await waitFor(() => state.getView().recentProjects?.length === 1);

    state.actions.openRecentProject?.("/work/pricing-redesign");
    await openCalled;
    await waitFor(() => state.getView().busy === false);

    expect(opened).toEqual(["/work/pricing-redesign"]);
    expect(state.getView().recentProjects).toEqual([project]);
    expect(state.getView().notice).toBeNull();
  });

  it("removes a recent project from the list", async () => {
    const { promise: removalCalled, resolve } = Promise.withResolvers<void>();
    installBridge({
      ...baseBridge(),
      listRecentProjects: async () => [project],
      removeRecentProject: async () => {
        resolve();
        return [];
      },
    });
    const state = createShellState();
    await waitFor(() => state.getView().recentProjects?.length === 1);

    state.actions.removeRecentProject?.("/work/pricing-redesign");
    await removalCalled;
    await waitFor(() => state.getView().recentProjects?.length === 0);

    expect(state.getView().recentProjects).toEqual([]);
  });

  it("surfaces project creation errors without leaving busy state", async () => {
    installBridge({
      ...baseBridge(),
      listRecentProjects: async () => [],
      createProject: async () => ({
        ok: false,
        error: "请选择一个空文件夹来创建新项目",
      }),
    });
    const state = createShellState();
    state.actions.createProject?.();
    await waitFor(() => Boolean(state.getView().notice));

    expect(state.getView().notice).toContain("创建项目失败");
    expect(state.getView().notice).toContain("空文件夹");
    expect(state.getView().busy).toBe(false);
  });

  it("returns to the workspace and hides the canvas bridge", async () => {
    const handlers: {
      project: ProjectHandler | null;
    } = { project: null };
    let workspaceCalls = 0;
    installBridge({
      ...baseBridge(),
      tree: async () => [],
      onProject: (cb) => {
        handlers.project = cb;
      },
      showWorkspace: async () => {
        workspaceCalls += 1;
        return true;
      },
    });
    const state = createShellState();
    handlers.project?.({
      root: "/work/pricing-redesign",
      manifest: {
        formatVersion: 1,
        pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
      },
      files: {},
    });
    expect(state.getView().projectRoot).toBe("/work/pricing-redesign");

    state.actions.showWorkspace?.();
    expect(state.getView().projectRoot).toBeNull();
    expect(state.getView().pages).toEqual([]);
    expect(state.getView().manifest).toBeNull();
    expect(workspaceCalls).toBe(1);
  });
});

type DocHandler = Parameters<ShellBridge["onDoc"]>[0];
type FilesHandler = Parameters<ShellBridge["onFiles"]>[0];
type ProjectHandler = Parameters<ShellBridge["onProject"]>[0];

describe("edit history auto refresh", () => {
  function entry(id: string, actor = "agent-1"): HistorySnapshotEntry {
    return {
      id,
      actor,
      stale: false,
      createdAt: Date.now(),
      files: ["pages/showcase.tsx"],
      before: { "pages/showcase.tsx": "before" },
      after: { "pages/showcase.tsx": `after-${id}` },
    };
  }

  function transaction(id: string) {
    return {
      id,
      changedFiles: ["pages/showcase.tsx"],
      versions: { "pages/showcase.tsx": `v-${id}` },
      origin: "agent" as const,
      actor: "agent-1",
    };
  }

  async function tick() {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  it("refreshes the transaction list when the document service reports a history change", async () => {
    let onDoc: DocHandler = () => {};
    let entries: HistorySnapshotEntry[] = [];
    installBridge({
      onProject: () => {},
      onFiles: () => {},
      onDoc: (cb) => {
        onDoc = cb;
      },
      onFatal: () => {},
      onStats: () => {},
      history: async () => entries,
    });
    const state = createShellState();

    entries = [entry("h1"), entry("h2")];
    onDoc({ kind: "historyChanged", canUndo: true, canRedo: false });

    await tick();
    expect(state.getView().editHistory).toHaveLength(2);
    expect(state.getView().canUndo).toBe(true);
  });

  it("refreshes the transaction list when only transactionApplied arrives", async () => {
    let onDoc: DocHandler = () => {};
    let entries: HistorySnapshotEntry[] = [];
    installBridge({
      onProject: () => {},
      onFiles: () => {},
      onDoc: (cb) => {
        onDoc = cb;
      },
      onFatal: () => {},
      onStats: () => {},
      history: async () => entries,
    });
    const state = createShellState();

    entries = [entry("h1"), entry("h2")];
    onDoc({ kind: "transactionApplied", transaction: transaction("t9") });

    await tick();
    expect(state.getView().editHistory).toHaveLength(2);
  });

  it("refreshes the transaction list when only the files snapshot arrives", async () => {
    let onFiles: FilesHandler = () => {};
    let entries: HistorySnapshotEntry[] = [];
    installBridge({
      onProject: () => {},
      onFiles: (cb) => {
        onFiles = cb;
      },
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
      tree: async () => [],
      history: async () => entries,
    });
    const state = createShellState();

    entries = [entry("h1"), entry("h2")];
    onFiles({ files: { "pages/showcase.tsx": "after" } });

    await tick();
    expect(state.getView().editHistory).toHaveLength(2);
  });

  it("refreshes the transaction list after a rollback without waiting for a doc event", async () => {
    let onFiles: FilesHandler = () => {};
    let entries: HistorySnapshotEntry[] = [entry("h1")];
    const sent: unknown[] = [];
    installBridge({
      onProject: () => {},
      onFiles: (cb) => {
        onFiles = cb;
      },
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
      tree: async () => [],
      history: async () => entries,
      send: async (message) => {
        sent.push(message);
        return true;
      },
    });
    const state = createShellState();
    await state.actions.refreshEditHistory?.();
    expect(state.getView().editHistory).toHaveLength(1);

    await state.actions.restoreEditHistory?.("h1");
    entries = [entry("h1"), entry("h2", "designer")];
    onFiles({ files: { "pages/showcase.tsx": "before" } });

    await tick();
    expect(state.getView().editHistory).toHaveLength(2);
    expect(sent).toEqual([
      {
        kind: "restoreVersion",
        files: { "pages/showcase.tsx": "before" },
      },
    ]);
  });

  it("coalesces a burst of triggers into one follow-up history read", async () => {
    let onDoc: DocHandler = () => {};
    let calls = 0;
    const first = Promise.withResolvers<HistorySnapshotEntry[]>();
    const second = Promise.withResolvers<HistorySnapshotEntry[]>();
    installBridge({
      onProject: () => {},
      onFiles: () => {},
      onDoc: (cb) => {
        onDoc = cb;
      },
      onFatal: () => {},
      onStats: () => {},
      history: () => {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    });
    const state = createShellState();

    onDoc({ kind: "historyChanged", canUndo: true, canRedo: false });
    onDoc({ kind: "transactionApplied", transaction: transaction("t9") });
    await tick();
    expect(calls).toBe(1);

    first.resolve([entry("h1")]);
    await tick();
    expect(calls).toBe(2);

    second.resolve([entry("h1"), entry("h2")]);
    await tick();
    expect(state.getView().editHistory).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it("drops an in-flight history read from before a project switch", async () => {
    let onProject: ProjectHandler = () => {};
    let calls = 0;
    const stale = Promise.withResolvers<HistorySnapshotEntry[]>();
    const current = Promise.withResolvers<HistorySnapshotEntry[]>();
    installBridge({
      onProject: (cb) => {
        onProject = cb;
      },
      onFiles: () => {},
      onDoc: () => {},
      onFatal: () => {},
      onStats: () => {},
      tree: async () => [],
      history: () => {
        calls += 1;
        return calls === 1 ? stale.promise : current.promise;
      },
    });
    const state = createShellState();
    void state.actions.refreshEditHistory?.();
    await tick();
    expect(calls).toBe(1);

    onProject({
      root: "/work/pricing-redesign",
      manifest: {
        formatVersion: 1,
        pages: [{ id: "pricing", name: "Pricing", file: "pages/pricing.tsx" }],
      },
      files: {},
    });

    stale.resolve([entry("old")]);
    await tick();
    expect(calls).toBe(2);
    expect(state.getView().editHistory?.some((item) => item.id === "old")).toBe(
      false,
    );

    current.resolve([entry("current")]);
    await tick();
    expect(state.getView().editHistory?.map((item) => item.id)).toEqual([
      "current",
    ]);
  });
});
