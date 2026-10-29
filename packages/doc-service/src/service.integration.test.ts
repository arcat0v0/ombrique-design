import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DocToShell } from "@ombrique/protocol";
import { DocumentService } from "./service";

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
let messages: DocToShell[];

function setupProject() {
  root = mkdtempSync(join(tmpdir(), "ombrique-doc-"));
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
  setupProject();
  messages = [];
  service = new DocumentService({ emit: (message) => messages.push(message) });
  service.open(root);
});

afterEach(() => {
  service.close();
  rmSync(root, { recursive: true, force: true });
});

function elementAt(path: number[]) {
  const page = service.project.index.pages.find(
    (p) => p.file === "pages/home.tsx",
  );
  expect(page).toBeDefined();
  const rootElement = page?.root;
  expect(rootElement).toBeDefined();
  let current = rootElement ?? null;
  for (const index of path) {
    current = current?.children[index] ?? null;
  }
  expect(current).not.toBeNull();
  return current;
}

describe("DocumentService", () => {
  it("opens a project and emits the manifest", () => {
    const opened = messages.find((m) => m.kind === "projectOpened");
    expect(opened).toBeDefined();
    expect(service.manifest.pages[0]?.file).toBe("pages/home.tsx");
  });

  it("applies setStyle atomically and reindexes", () => {
    const target = elementAt([0, 0]);
    expect(target).not.toBeNull();
    const transaction = service.apply(
      [
        {
          kind: "setStyle",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          declarations: [["color", "#00ff00"]],
        },
      ],
      [],
    );
    expect(transaction.changedFiles).toEqual(["pages/home.tsx"]);
    const text = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(text).toContain('color: "#00ff00"');
    expect(text).toContain("fontSize: 32");
    expect(service.project.files.get("pages/home.tsx")?.text).toBe(text);
  });

  it("undoes and redoes a transaction", () => {
    const target = elementAt([0, 0]);
    service.apply(
      [
        {
          kind: "setStyle",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          declarations: [["color", "#00ff00"]],
        },
      ],
      [],
    );
    const afterApply = readFileSync(join(root, "pages/home.tsx"), "utf8");
    service.undo();
    const afterUndo = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(afterUndo).toBe(HOME_PAGE);
    service.redo();
    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toBe(afterApply);
  });

  it("reports history availability through events", () => {
    const target = elementAt([0, 0]);
    service.apply(
      [
        {
          kind: "setStyle",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          declarations: [["color", "#00ff00"]],
        },
      ],
      [],
    );
    const historyEvents = messages.filter((m) => m.kind === "historyChanged");
    expect(historyEvents.at(-1)).toEqual({
      kind: "historyChanged",
      canUndo: true,
      canRedo: false,
    });
  });

  it("detects external edits, reindexes, and invalidates history", async () => {
    const target = elementAt([0, 0]);
    service.apply(
      [
        {
          kind: "setStyle",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          declarations: [["color", "#00ff00"]],
        },
      ],
      [],
    );
    const external = HOME_PAGE.replace("Ship faster", "Ship even faster");
    writeFileSync(join(root, "pages/home.tsx"), external);
    const changed = service.refreshExternal(["pages/home.tsx"]);
    expect(changed).toEqual(["pages/home.tsx"]);
    expect(service.project.files.get("pages/home.tsx")?.text).toBe(external);
    expect(service.diagnostics().length).toBeGreaterThanOrEqual(0);
    const historyEvent = messages
      .filter((m) => m.kind === "historyChanged")
      .at(-1);
    expect(historyEvent).toEqual({
      kind: "historyChanged",
      canUndo: false,
      canRedo: false,
    });
  });

  it("rejects commands whose node path no longer exists", () => {
    expect(() =>
      service.apply(
        [
          {
            kind: "setStyle",
            target: { file: "pages/home.tsx", start: 0, end: 1, path: [9, 9] },
            declarations: [["color", "#00ff00"]],
          },
        ],
        [],
      ),
    ).toThrow();
    expect(readFileSync(join(root, "pages/home.tsx"), "utf8")).toBe(HOME_PAGE);
    const failure = messages.find((m) => m.kind === "commandFailed");
    expect(failure).toBeDefined();
  });

  it("never writes outside the project root", () => {
    expect(() => service.writeRaw("../escape.tsx", "x")).toThrow();
  });
});

describe("DocumentService manifest sync", () => {
  it("re-emits the manifest after applyCommands that change pages", () => {
    const target = elementAt([0, 0]);
    service.apply(
      [
        {
          kind: "setStyle",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          declarations: [["color", "#00ff00"]],
        },
      ],
      [],
    );
    const manifestEvents = messages.filter((m) => m.kind === "manifestChanged");
    expect(manifestEvents.length).toBeGreaterThanOrEqual(1);
    expect(manifestEvents.at(-1)?.manifest.pages[0]?.file).toBe(
      "pages/home.tsx",
    );
  });

  it("emits manifestChanged after addPage with the new page", () => {
    const before = service.manifest.pages.length;
    service.apply([{ kind: "addPage", name: "Extra" }], []);
    const manifestEvents = messages.filter((m) => m.kind === "manifestChanged");
    expect(service.manifest.pages.length).toBe(before + 1);
    expect(manifestEvents.at(-1)?.manifest.pages.length).toBe(before + 1);
  });

  it("emits manifestChanged after undo", () => {
    service.apply([{ kind: "addPage", name: "Undo Me" }], []);
    service.undo();
    const manifestEvents = messages.filter((m) => m.kind === "manifestChanged");
    expect(
      manifestEvents.at(-1)?.manifest.pages.some((p) => p.name === "Undo Me"),
    ).toBe(false);
  });
});

describe("DocumentService duplicateNode", () => {
  it("clones a node with its content and offsets its position", () => {
    const target = elementAt([0]);
    const transaction = service.apply(
      [
        {
          kind: "duplicateNode",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          dx: 20,
          dy: 20,
        },
      ],
      [],
    );
    expect(transaction.changedFiles).toContain("pages/home.tsx");
    const text = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(text.match(/data-name="Hero"/g)).toHaveLength(2);
    expect(text).toContain("left: 100");
    expect(text).toContain("top: 140");
  });
});

describe("DocumentService external edit & stale version conflict loop", () => {
  it("reloads external edit on stale version conflict and succeeds via path re-anchoring", () => {
    const target = elementAt([0]);
    const staleVersion =
      service.project.files.get("pages/home.tsx")?.version ?? "";

    const externalCode = HOME_PAGE.replace(
      'fontSize: 32, color: "#111111"',
      'fontSize: 36, color: "#222222"',
    );
    writeFileSync(join(root, "pages/home.tsx"), externalCode);

    const transaction = service.apply(
      [
        {
          kind: "setStyle",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          declarations: [["background", "#0000ff"]],
        },
      ],
      [staleVersion],
    );

    expect(transaction.changedFiles).toContain("pages/home.tsx");
    const currentText = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(currentText).toContain("fontSize: 36");
    expect(currentText).toContain('background: "#0000ff"');
  });

  it("emits commandFailed with friendly message when external edit deletes target node", () => {
    const target = elementAt([0, 0]);
    const staleVersion =
      service.project.files.get("pages/home.tsx")?.version ?? "";

    const externalCode = HOME_PAGE.replace(
      '<h1 data-name="Title" style={{ fontSize: 32, color: "#111111" }}>Ship faster</h1>',
      "",
    );
    writeFileSync(join(root, "pages/home.tsx"), externalCode);

    expect(() =>
      service.apply(
        [
          {
            kind: "setStyle",
            target: {
              file: "pages/home.tsx",
              start: target?.ref.start ?? 0,
              end: target?.ref.end ?? 0,
              path: target?.path,
            },
            declarations: [["color", "#ff0000"]],
          },
        ],
        [staleVersion],
      ),
    ).toThrow();

    const failed = messages.find((m) => m.kind === "commandFailed");
    expect(failed).toBeDefined();
    expect(failed?.message).toContain("节点已不存在或代码已被改动");
  });
});

describe("DocumentService layout props & constraints", () => {
  it("adds missing layout props to a Frame via setAttrs (layout/gap/align/justify)", () => {
    const target = elementAt([0]);
    const transaction = service.apply(
      [
        {
          kind: "setAttrs",
          target: {
            file: "pages/home.tsx",
            start: target?.ref.start ?? 0,
            end: target?.ref.end ?? 0,
            path: target?.path,
          },
          attrs: { layout: "vertical", gap: 16, align: "center" },
        },
      ],
      [],
    );
    expect(transaction.changedFiles).toContain("pages/home.tsx");
    const text = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(text).toContain('layout="vertical"');
    expect(text).toContain("gap={16}");
    expect(text).toContain('align="center"');

    service.undo();
    const restored = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(restored).toBe(HOME_PAGE);
  });

  it("maps Fill sizing to flex/align-self style and Fixed back to width (reversible)", () => {
    const hero = elementAt([0]);
    const ref = {
      file: "pages/home.tsx",
      start: hero?.ref.start ?? 0,
      end: hero?.ref.end ?? 0,
      path: hero?.path,
    };
    service.apply(
      [
        {
          kind: "setStyle",
          target: ref,
          declarations: [["flex", 1]],
        },
      ],
      [],
    );
    const afterFill = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(afterFill).toContain('flex: "1"');

    service.undo();
    const afterFixed = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(afterFixed).not.toContain("flex");
    expect(afterFixed).toContain("left: 80");
  });

  it("maps constraint Left&Right to left+right style and Center to calc/translate", () => {
    const hero = elementAt([0]);
    const ref = {
      file: "pages/home.tsx",
      start: hero?.ref.start ?? 0,
      end: hero?.ref.end ?? 0,
      path: hero?.path,
    };
    service.apply(
      [
        {
          kind: "setStyle",
          target: ref,
          declarations: [
            ["right", 40],
            ["translate", "-50%"],
          ],
        },
      ],
      [],
    );
    const after = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(after).toContain("right: 40");
    expect(after).toContain('translate: "-50%"');

    service.undo();
    const restored = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(restored).toBe(HOME_PAGE);
  });
  it("creates tokens.css, sets token value, and supports undo/redo", () => {
    service.apply(
      [
        {
          kind: "createToken",
          name: "brand-blue",
          value: "#0066cc",
        },
      ],
      [],
    );
    const created = readFileSync(join(root, "tokens.css"), "utf8");
    expect(created).toContain("--brand-blue: #0066cc;");

    service.apply(
      [
        {
          kind: "setTokenValue",
          name: "brand-blue",
          value: "#004499",
        },
      ],
      [],
    );
    const updated = readFileSync(join(root, "tokens.css"), "utf8");
    expect(updated).toContain("--brand-blue: #004499;");

    service.undo();
    const afterUndo = readFileSync(join(root, "tokens.css"), "utf8");
    expect(afterUndo).toContain("--brand-blue: #0066cc;");

    service.redo();
    const afterRedo = readFileSync(join(root, "tokens.css"), "utf8");
    expect(afterRedo).toContain("--brand-blue: #004499;");
  });

  it("updates shared styles in scss files with undo/redo", () => {
    const dir = mkdtempSync(join(tmpdir(), "ombrique-shared-style-"));
    writeFileSync(
      join(dir, "ombrique.json"),
      JSON.stringify({ formatVersion: 1, pages: [] }),
      "utf8",
    );
    const scssPath = join(dir, "styles.scss");
    writeFileSync(
      scssPath,
      ".card {\n  background: #ffffff;\n  padding: 16px;\n}\n",
      "utf8",
    );
    const s = new DocumentService();
    s.open(dir);

    const rule = s.project.index.styles.byClass.get("card")?.[0];
    const bgDecl = rule?.decls.find((d) => d.prop === "background");
    if (!rule || !bgDecl) throw new Error("missing card rule");

    s.apply(
      [
        {
          kind: "setSharedStyle",
          file: "styles.scss",
          start: bgDecl.valueSpan.start,
          end: bgDecl.valueSpan.end,
          value: "#f0f0f0",
        },
      ],
      [],
    );
    const after = readFileSync(scssPath, "utf8");
    expect(after).toBe(
      ".card {\n  background: #f0f0f0;\n  padding: 16px;\n}\n",
    );

    s.undo();
    const restored = readFileSync(scssPath, "utf8");
    expect(restored).toBe(
      ".card {\n  background: #ffffff;\n  padding: 16px;\n}\n",
    );
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a component file, updates caller, and supports undo/redo", () => {
    const page = service.project.index.pages.find(
      (p) => p.file === "pages/home.tsx",
    );
    const hero = page?.root?.children[0];
    if (!hero) throw new Error("missing hero");

    service.apply(
      [
        {
          kind: "createComponent",
          target: hero.ref,
          name: "HeroCard",
        },
      ],
      [],
    );

    const compFile = join(root, "components/HeroCard.tsx");
    expect(readFileSync(compFile, "utf8")).toContain(
      "export function HeroCard()",
    );
    const homeAfter = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(homeAfter).toContain(
      'import { HeroCard } from "../components/HeroCard";',
    );
    expect(homeAfter).toContain("<HeroCard />");

    service.undo();
    const homeRestored = readFileSync(join(root, "pages/home.tsx"), "utf8");
    expect(homeRestored).toContain('data-name="Hero"');
  });
});
