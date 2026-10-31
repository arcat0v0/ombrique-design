import { describe, expect, it } from "vitest";

function indexPath(index: DesignIndex, file: string, path: number[]) {
  const target = index.byPath(file, path);
  if (!target) throw new Error(`missing ${file}#${path.join("/")}`);
  return target;
}
import type { EditCommand } from "../../protocol/src/index.js";
import { applyEdits } from "./apply-edits.js";
import { buildIndex, type DesignIndex } from "./build-index.js";
import { planPatch } from "./plan-patch.js";
import type { DesignElement, PlanResult, TextEdit } from "./types.js";

const PAGE = `import { Frame, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400 }}>
        <Text x={0} y={0} width={300} fontSize={24}>标题</Text>
        <div data-name="Sub" hidden />
      </div>
    </Frame>
  );
}
`;

const PAGE2 = `import { Frame } from "@ombrique/runtime";

export default function Board() {
  return (
    <Frame name="Board" x={0} y={0} width={500} height={500}>
      <div data-name="Lane" />
    </Frame>
  );
}
`;

const MANIFEST = `{
  "formatVersion": 1,
  "pages": [
    { "id": "home", "name": "Home", "file": "pages/home.tsx" },
    { "id": "board", "name": "Board", "file": "pages/board.tsx" }
  ]
}
`;

function makeFiles(): Record<string, string> {
  return {
    "ombrique.json": MANIFEST,
    "pages/home.tsx": PAGE,
    "pages/board.tsx": PAGE2,
  };
}

function makeIndex(): DesignIndex {
  return buildIndex(makeFiles());
}

function byName(index: DesignIndex, file: string, name: string): DesignElement {
  const parsed = index.byPath(file, [0]);
  if (!parsed) throw new Error(`no root in ${file}`);
  const stack = [parsed];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.dataAttrs["data-name"] === name) return current;
    for (const child of current.children) stack.push(child);
  }
  throw new Error(`element ${name} not found in ${file}`);
}

function patch(
  index: DesignIndex,
  input: EditCommand | EditCommand[],
): { next: Record<string, string>; result: PlanResult } {
  const result = planPatch(index, input);
  const next: Record<string, string> = Object.fromEntries(index.sources);
  for (const file of result.changedFiles) {
    const fileEdits = result.edits.filter((e) => e.file === file);
    next[file] = applyEdits(next[file] ?? "", fileEdits);
  }
  return { next, result };
}

function untouched(original: string, next: string, edits: TextEdit[]): void {
  const fileEdits = edits.filter((e) => e.file === "pages/home.tsx");
  if (fileEdits.length === 0) return;
  const sorted = [...fileEdits].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return;
  expect(next.slice(0, first.start)).toBe(original.slice(0, first.start));
  let delta = 0;
  for (const edit of sorted)
    delta += edit.text.length - (edit.end - edit.start);
  expect(next.slice(last.end + delta)).toBe(original.slice(last.end));
}

const rect = {
  kind: "rect",
  name: "Box",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  fill: "#ff0000",
} as const;

describe("planPatch: setStyle", () => {
  it("updates, appends, and removes style props, creating the attribute when missing", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const updated = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [["left", 100]],
    });
    expect(updated.next["pages/home.tsx"]).toBe(
      PAGE.replace("left: 80", "left: 100"),
    );
    expect(updated.result.edits).toHaveLength(1);
    untouched(PAGE, updated.next["pages/home.tsx"] ?? "", updated.result.edits);

    const appended = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [["background", "#000000"]],
    });
    expect(appended.next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, top: 120, width: 400, background: "#000000" }}',
    );

    const removed = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [["top", null]],
    });
    expect(removed.next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, width: 400 }}',
    );

    const mixed = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [
        ["width", 500],
        ["top", null],
        ["background", "#111111"],
      ],
    });
    expect(mixed.next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, width: 500, background: "#111111" }}',
    );

    const sub = byName(index, "pages/home.tsx", "Sub");
    const created = patch(index, {
      kind: "setStyle",
      target: sub.ref,
      declarations: [["left", 10]],
    });
    expect(created.next["pages/home.tsx"]).toContain(
      '<div data-name="Sub" hidden style={{ left: 10 }} />',
    );
  });

  it("writes numbers for PX props and quoted strings otherwise", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [
        ["left", 120],
        ["opacity", 0.5],
      ],
    });
    expect(next["pages/home.tsx"]).toContain(
      'left: 120, top: 120, width: 400, opacity: "0.5"',
    );
  });
});

describe("planPatch: setText", () => {
  it("replaces the text child, inserts one after the opening tag, and expands self-closing elements", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("text missing");
    const replaced = patch(index, {
      kind: "setText",
      target: text.ref,
      text: "新标题",
    });
    expect(replaced.next["pages/home.tsx"]).toContain(
      "<Text x={0} y={0} width={300} fontSize={24}>新标题</Text>",
    );

    const hero = byName(index, "pages/home.tsx", "Hero");
    const inserted = patch(index, {
      kind: "setText",
      target: hero.ref,
      text: "X",
    });
    expect(inserted.next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, top: 120, width: 400 }}>X\n',
    );

    const sub = byName(index, "pages/home.tsx", "Sub");
    const expanded = patch(index, {
      kind: "setText",
      target: sub.ref,
      text: "note",
    });
    expect(expanded.next["pages/home.tsx"]).toContain(
      '<div data-name="Sub" hidden>note</div>',
    );
  });
});

describe("planPatch: setAttrs", () => {
  it("adds, modifies, and removes attributes with per-value-type formatting", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const added = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { "data-locked": "yes" },
    });
    expect(added.next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, top: 120, width: 400 }} data-locked="yes">',
    );

    const modified = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { "data-name": "Hero2" },
    });
    expect(modified.next["pages/home.tsx"]).toContain('data-name="Hero2"');
    expect(modified.next["pages/home.tsx"]).not.toContain('data-name="Hero"');

    const removed = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { "data-name": null },
    });
    expect(removed.next["pages/home.tsx"]).toContain(
      '<div style={{ position: "absolute", left: 80, top: 120, width: 400 }}>',
    );

    const sub = byName(index, "pages/home.tsx", "Sub");
    const numeric = patch(index, {
      kind: "setAttrs",
      target: sub.ref,
      attrs: { count: 3 },
    });
    expect(numeric.next["pages/home.tsx"]).toContain("count={3}");

    const escaped = patch(index, {
      kind: "setAttrs",
      target: sub.ref,
      attrs: { "data-name": 'a"b' },
    });
    expect(escaped.next["pages/home.tsx"]).toContain('data-name="a\\"b"');

    const hidden = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { hidden: true },
    });
    expect(hidden.next["pages/home.tsx"]).toContain("width: 400 }} hidden>");

    const notHidden = patch(index, {
      kind: "setAttrs",
      target: sub.ref,
      attrs: { hidden: false },
    });
    expect(notHidden.next["pages/home.tsx"]).toContain(
      '<div data-name="Sub" />',
    );
  });
});

describe("planPatch: createNodes", () => {
  it("creates an image node with src and radius", () => {
    const rawCode = `import { Frame } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
    </Frame>
  );
}
`;
    const index = buildIndex({
      "pages/home.tsx": rawCode,
    });
    const result = planPatch(index, {
      kind: "createNodes",
      parent: null,
      pageFile: "pages/home.tsx",
      index: 0,
      specs: [
        {
          kind: "image",
          name: "Cover",
          x: 40,
          y: 40,
          width: 300,
          height: 200,
          src: "/assets/cover.png",
          radius: 12,
        },
      ],
    });
    const next = applyEdits(rawCode, result.edits);
    expect(next).toContain('src="/assets/cover.png"');
    expect(next).toContain("radius={12}");
    const lines = next.split("\n");
    const imageIdx = lines.findIndex((l) => l.includes("<Image"));
    const frameCloseIdx = lines.findIndex((l) => l.includes("</Frame>"));
    expect(imageIdx).toBeGreaterThan(-1);
    expect(imageIdx).toBe(frameCloseIdx - 1);
    expect(lines[imageIdx]?.startsWith("    ")).toBe(true);
  });

  it("appends generated nodes at the child index and inserts before an existing child", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const appended = patch(index, {
      kind: "createNodes",
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 2,
      specs: [rect],
    });
    const heroBlock = [
      '      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400 }}>',
      "        <Text x={0} y={0} width={300} fontSize={24}>标题</Text>",
      '        <div data-name="Sub" hidden />',
      '        <Rect data-name="Box" x={10} y={20} width={100} height={50} fill="#ff0000" />',
      "      </div>",
    ].join("\n");
    expect(appended.next["pages/home.tsx"]).toContain(heroBlock);

    const prepended = patch(index, {
      kind: "createNodes",
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 0,
      specs: [rect],
    });
    const lines = (prepended.next["pages/home.tsx"] ?? "").split("\n");
    const rectIdx = lines.findIndex((l) => l.includes("<Rect"));
    const textIdx = lines.findIndex((l) => l.includes("<Text"));
    expect(rectIdx).toBeGreaterThan(-1);
    expect(textIdx).toBe(rectIdx + 1);
  });

  it("generates every node spec kind", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const specs = [
      { kind: "frame", name: "Wrap", x: 1, y: 2, width: 3, height: 4 },
      {
        kind: "ellipse",
        name: "Dot",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        fill: "#00ff00",
      },
      { kind: "star", name: "Spark", x: 1, y: 2, width: 3, height: 4 },
      {
        kind: "path",
        name: "Route",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        d: "M0 0L3 4",
        fill: "#0000ff",
        stroke: "#111111",
        strokeWidth: 2,
      },
      {
        kind: "image",
        name: "Photo",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        src: "assets/photo.png",
        radius: 4,
      },
      { kind: "text", text: "hello", x: 1, y: 2, width: 3, fontSize: 12 },
    ] as const;
    const { next } = patch(index, {
      kind: "createNodes",
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 2,
      specs: [...specs],
    });
    const code = next["pages/home.tsx"] ?? "";
    expect(code).toContain(
      '<Frame data-name="Wrap" x={1} y={2} width={3} height={4} fill="#d9d9d9" />',
    );
    expect(code).toContain(
      '<Ellipse data-name="Dot" x={1} y={2} width={3} height={4} fill="#00ff00" />',
    );
    expect(code).toContain(
      '<Star data-name="Spark" x={1} y={2} width={3} height={4} fill="#d9d9d9" />',
    );
    expect(code).toContain(
      '<Path data-name="Route" x={1} y={2} width={3} height={4} d="M0 0L3 4" fill="#0000ff" stroke="#111111" strokeWidth={2} />',
    );
    expect(code).toContain(
      'import { Frame, Text, Ellipse, Star, Path, Image } from "@ombrique/runtime";',
    );
    expect(code).toContain('src="assets/photo.png"');
    expect(code).toContain("radius={4}");
    expect(code).toContain(
      '<Text style={{ position: "absolute", left: 1, top: 2, width: 3, fontSize: 12 }}>hello</Text>',
    );
  });
});

describe("planPatch: deleteNodes", () => {
  it("deletes whole elements including their lines and merges adjacent deletions", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const single = patch(index, {
      kind: "deleteNodes",
      targets: [sub.ref],
    });
    expect(single.next["pages/home.tsx"]).toBe(
      PAGE.replace('        <div data-name="Sub" hidden />\n', ""),
    );
    expect(single.result.edits).toHaveLength(1);

    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("text missing");
    const merged = patch(index, {
      kind: "deleteNodes",
      targets: [sub.ref, text.ref],
    });
    expect(merged.result.edits).toHaveLength(1);
    expect(merged.next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, top: 120, width: 400 }}>\n      </div>',
    );
  });

  it("deletes nested subtrees", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, { kind: "deleteNodes", targets: [hero.ref] });
    expect(next["pages/home.tsx"]).toBe(
      PAGE.replace(
        '      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400 }}>\n        <Text x={0} y={0} width={300} fontSize={24}>标题</Text>\n        <div data-name="Sub" hidden />\n      </div>\n',
        "",
      ),
    );
  });
});

describe("planPatch: reparent", () => {
  it("moves an element into another parent at an index and reorders within the same parent", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const frame = index.byPath("pages/home.tsx", [0]);
    if (!frame) throw new Error("frame missing");
    const moved = patch(index, {
      kind: "reparent",
      target: sub.ref,
      parent: frame.ref,
      pageFile: "pages/home.tsx",
      index: 0,
    });
    expect(moved.result.edits).toHaveLength(2);
    const movedLines = (moved.next["pages/home.tsx"] ?? "").split("\n");
    const subIdx = movedLines.findIndex((l) => l.includes('data-name="Sub"'));
    const heroIdx = movedLines.findIndex((l) => l.includes('data-name="Hero"'));
    expect(subIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBe(subIdx + 1);
    expect(movedLines[subIdx]).toBe('      <div data-name="Sub" hidden />');
    expect(moved.next["pages/home.tsx"]).not.toContain(
      '<div data-name="Sub" hidden />\n      </div>',
    );

    const hero = byName(index, "pages/home.tsx", "Hero");
    const reordered = patch(index, {
      kind: "reparent",
      target: sub.ref,
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 0,
    });
    const lines = (reordered.next["pages/home.tsx"] ?? "").split("\n");
    const subLine = lines.findIndex((l) => l.includes('data-name="Sub"'));
    const textLine = lines.findIndex((l) => l.includes("<Text"));
    expect(subLine).toBe(textLine - 1);
    expect(lines[subLine]).toBe('        <div data-name="Sub" hidden />');
  });

  it("expands a self-closing destination and moves elements across files", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    const sub = byName(index, "pages/home.tsx", "Sub");
    if (!text) throw new Error("text missing");
    const expanded = patch(index, {
      kind: "reparent",
      target: text.ref,
      parent: sub.ref,
      pageFile: "pages/home.tsx",
      index: 0,
    });
    const block = [
      '        <div data-name="Sub" hidden>',
      "          <Text x={0} y={0} width={300} fontSize={24}>标题</Text>",
      "        </div>",
    ].join("\n");
    expect(expanded.next["pages/home.tsx"]).toContain(block);
    expect(expanded.next["pages/home.tsx"]).not.toContain(
      "标题</Text>\n      </div>",
    );

    const lane = byName(index, "pages/board.tsx", "Lane");
    const moved = patch(index, {
      kind: "reparent",
      target: text.ref,
      parent: lane.ref,
      pageFile: "pages/board.tsx",
      index: 0,
    });
    expect(moved.result.changedFiles).toContain("pages/home.tsx");
    expect(moved.result.changedFiles).toContain("pages/board.tsx");
    expect(moved.next["pages/home.tsx"] ?? "").not.toContain("标题");
    expect(moved.next["pages/board.tsx"]).toContain(
      "<Text x={0} y={0} width={300} fontSize={24}>标题</Text>",
    );
  });

  it("refuses to move an element into its own subtree", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const sub = byName(index, "pages/home.tsx", "Sub");
    expect(() =>
      planPatch(index, {
        kind: "reparent",
        target: hero.ref,
        parent: sub.ref,
        pageFile: "pages/home.tsx",
        index: 0,
      }),
    ).toThrow(/subtree/);
  });
});

describe("planPatch: duplicateNode", () => {
  it("clones the element source verbatim and offsets left/top by dx/dy", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "duplicateNode",
      target: hero.ref,
      dx: 20,
      dy: 20,
    });
    const code = next["pages/home.tsx"] ?? "";
    expect(code).toContain('data-name="Hero"');
    expect(code).toContain("left: 100");
    expect(code).toContain("top: 140");
    expect(code.match(/data-name="Hero"/g)).toHaveLength(2);
  });

  it("duplicates a runtime node with x/y props when no style left/top exist, keeping the duplicate adjacent", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("text missing");
    const { next } = patch(index, {
      kind: "duplicateNode",
      target: text.ref,
      dx: 20,
      dy: 20,
    });
    const code = next["pages/home.tsx"] ?? "";
    expect(code.match(/<Text/g)).toHaveLength(2);
    expect(code).toContain("<Text x={20} y={20} width={300} fontSize={24}>");

    const sub = byName(index, "pages/home.tsx", "Sub");
    const adjacent = patch(index, {
      kind: "duplicateNode",
      target: sub.ref,
      dx: 20,
      dy: 20,
    });
    const lines = (adjacent.next["pages/home.tsx"] ?? "").split("\n");
    const first = lines.findIndex((l) => l.includes('data-name="Sub"'));
    expect(lines[first + 1]).toBe('        <div data-name="Sub" hidden />');
  });
});

describe("planPatch: groupNodes", () => {
  it("wraps sibling nodes in a Group element, moving their source verbatim", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    const sub = byName(index, "pages/home.tsx", "Sub");
    if (!text || !sub) throw new Error("missing targets");
    const { next } = patch(index, {
      kind: "groupNodes",
      targets: [text.ref, sub.ref],
      parent: byName(index, "pages/home.tsx", "Hero").ref,
      pageFile: "pages/home.tsx",
      index: 0,
      name: "Content",
    });
    const code = next["pages/home.tsx"] ?? "";
    expect(code).toContain('<Group data-name="Content">');
    expect(code).toMatch(
      /import \{ Frame, Text, Group \} from "@ombrique\/runtime";/,
    );
    expect(code).toContain(
      "<Text x={0} y={0} width={300} fontSize={24}>标题</Text>",
    );
    expect(code).toContain('<div data-name="Sub" hidden />');
    const groupIdx = code.indexOf('data-name="Content"');
    const textIdx = code.indexOf("<Text");
    const closeIdx = code.indexOf("</Group>");
    expect(textIdx).toBeGreaterThan(groupIdx);
    expect(closeIdx).toBeGreaterThan(textIdx);
  });

  it("keeps grouped children re-indexed for later commands and rejects grouping a node with its own ancestor", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("missing target");
    const hero = byName(index, "pages/home.tsx", "Hero");
    const sub = byName(index, "pages/home.tsx", "Sub");
    expect(() =>
      planPatch(index, {
        kind: "groupNodes",
        targets: [hero.ref, sub.ref],
        parent: hero.ref,
        pageFile: "pages/home.tsx",
        index: 0,
        name: "Bad",
      }),
    ).toThrow();

    const first = patch(index, {
      kind: "groupNodes",
      targets: [text.ref],
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 0,
      name: "Wrap",
    });
    const wrapped = byName(buildIndex(first.next), "pages/home.tsx", "Wrap");
    expect(wrapped).toBeDefined();
    expect(wrapped.children.length).toBe(1);
    const second = patch(buildIndex(first.next), {
      kind: "setAttrs",
      target: wrapped.ref,
      attrs: { "data-locked": true },
    });
    expect(second.next["pages/home.tsx"]).toContain(
      'data-name="Wrap" data-locked',
    );
  });
});

describe("planPatch: ungroupNode", () => {
  it("removes the Group wrapper and hoists children to its position", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("missing target");
    const grouped = patch(index, {
      kind: "groupNodes",
      targets: [text.ref],
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 0,
      name: "Wrap",
    });
    const wrap = byName(buildIndex(grouped.next), "pages/home.tsx", "Wrap");
    const ungrouped = patch(buildIndex(grouped.next), {
      kind: "ungroupNode",
      target: wrap.ref,
    });
    const code = ungrouped.next["pages/home.tsx"] ?? "";
    expect(code).not.toContain("Wrap");
    expect(code).toContain(
      "<Text x={0} y={0} width={300} fontSize={24}>标题</Text>",
    );
    const restored = buildIndex(ungrouped.next);
    const heroAfter = byName(restored, "pages/home.tsx", "Hero");
    expect(heroAfter.children).toHaveLength(2);
    expect(heroAfter.children[0]?.tag).toBe("Text");
    expect(heroAfter.children[1]?.dataAttrs["data-name"]).toBe("Sub");
  });
});

describe("planPatch: pages", () => {
  it("addPage creates a page file, slugifies and deduplicates names, and edits the manifest", () => {
    const index = makeIndex();
    const added = patch(index, { kind: "addPage", name: "About" });
    expect(added.result.changedFiles).toContain("pages/about.tsx");
    expect(added.result.changedFiles).toContain("ombrique.json");
    expect(added.next["pages/about.tsx"]).toBe(
      [
        'import { Frame } from "@ombrique/runtime";',
        "",
        "export default function About() {",
        "  return (",
        '    <Frame name="About" x={0} y={0} width={1440} height={900} fill="#ffffff">',
        "    </Frame>",
        "  );",
        "}",
        "",
      ].join("\n"),
    );
    expect(added.next["ombrique.json"]).toBe(
      '{\n  "formatVersion": 1,\n  "pages": [\n    { "id": "home", "name": "Home", "file": "pages/home.tsx" },\n    { "id": "board", "name": "Board", "file": "pages/board.tsx" },\n    { "id": "about", "name": "About", "file": "pages/about.tsx" }\n  ]\n}\n',
    );

    const deduped = patch(index, { kind: "addPage", name: "Board" });
    expect(deduped.next["pages/board-2.tsx"]).toContain(
      "export default function Board2()",
    );
    expect(deduped.next["ombrique.json"]).toContain(
      '"file": "pages/board-2.tsx"',
    );

    const slugified = patch(index, { kind: "addPage", name: "My Settings!" });
    expect(slugified.next["pages/my-settings.tsx"]).toContain(
      'name="My Settings!"',
    );
    expect(slugified.next["ombrique.json"]).toContain('"id": "my-settings"');
  });

  it("renamePage only rewrites the manifest name and deletePage removes the entry with its comma", () => {
    const index = makeIndex();
    const renamed = patch(index, {
      kind: "renamePage",
      pageId: "home",
      name: "Main",
    });
    expect(renamed.result.changedFiles).toEqual(["ombrique.json"]);
    expect(renamed.next["ombrique.json"]).toContain(
      '{ "id": "home", "name": "Main", "file": "pages/home.tsx" }',
    );
    expect(renamed.next["pages/home.tsx"]).toBe(PAGE);

    const removed = patch(index, {
      kind: "deletePage",
      pageId: "board",
    });
    expect(removed.result.meta.deletedPageFile).toBe("pages/board.tsx");
    expect(removed.next["ombrique.json"]).not.toContain("pages/board.tsx");
    expect(removed.next["pages/board.tsx"]).toBe(PAGE2);

    const middle = patch(index, { kind: "deletePage", pageId: "home" });
    expect(middle.next["ombrique.json"]).toBe(
      '{\n  "formatVersion": 1,\n  "pages": [\n    { "id": "board", "name": "Board", "file": "pages/board.tsx" }\n  ]\n}\n',
    );
  });
});

describe("planPatch: multi-command", () => {
  it("applies commands sequentially, re-anchoring paths after earlier commands shift offsets", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("text missing");
    const { next, result } = patch(index, [
      { kind: "setStyle", target: hero.ref, declarations: [["left", 200]] },
      { kind: "setText", target: text.ref, text: "更新" },
      { kind: "setAttrs", target: hero.ref, attrs: { "data-locked": true } },
    ]);
    const code = next["pages/home.tsx"] ?? "";
    expect(code).toContain("left: 200");
    expect(code).toContain(">更新</Text>");
    expect(code).toContain("}} data-locked>");
    expect(result.edits.length).toBeGreaterThanOrEqual(3);
    untouched(PAGE, code, result.edits);

    const sub = byName(index, "pages/home.tsx", "Sub");
    const shifted = patch(index, [
      { kind: "deleteNodes", targets: [sub.ref] },
      { kind: "setText", target: text.ref, text: "仍在" },
    ]);
    expect(shifted.next["pages/home.tsx"]).toContain(">仍在</Text>");
    expect(shifted.next["pages/home.tsx"]).not.toContain("Sub");
  });

  it("combines edits from multiple files", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const lane = byName(index, "pages/board.tsx", "Lane");
    const { next, result } = patch(index, [
      { kind: "setStyle", target: hero.ref, declarations: [["left", 5]] },
      { kind: "setAttrs", target: lane.ref, attrs: { "data-locked": true } },
    ]);
    expect(result.changedFiles).toEqual(["pages/home.tsx", "pages/board.tsx"]);
    expect(next["pages/home.tsx"]).toContain("left: 5");
    expect(next["pages/board.tsx"]).toContain('data-name="Lane" data-locked');
  });
});

describe("planPatch: setSharedStyle", () => {
  it("replaces the declaration value using the exact span and rejects path traversal", () => {
    const scss = ".card {\n  color: #111111; /* text */\n  padding: 12px;\n}\n";
    const index = buildIndex({ "styles.scss": scss });
    const rule = index.styles.byClass.get("card")?.[0];
    const decl = rule?.decls.find((d) => d.prop === "color");
    if (!decl) throw new Error("missing color decl");
    const { next, result } = patch(index, {
      kind: "setSharedStyle",
      file: "styles.scss",
      start: decl.valueSpan.start,
      end: decl.valueSpan.end,
      value: "#ff0000",
    });
    expect(result.edits).toHaveLength(1);
    expect(next["styles.scss"]).toBe(
      ".card {\n  color: #ff0000; /* text */\n  padding: 12px;\n}\n",
    );

    expect(() =>
      planPatch(index, {
        kind: "setSharedStyle",
        file: "../secret.txt",
        start: 0,
        end: 1,
        value: "evil",
      }),
    ).toThrow(/traversal/i);
  });
});

describe("planPatch: tokens", () => {
  it("updates existing tokens in tokens.css preserving comments and indentation", () => {
    const css = ":root {\n  --primary: #3b82f6; /* blue */\n  --gap: 8px;\n}\n";
    const index = buildIndex({ "tokens.css": css });
    const updated = patch(index, {
      kind: "setTokenValue",
      name: "--primary",
      value: "#1d4ed8",
    });
    expect(updated.result.edits).toHaveLength(1);
    expect(updated.next["tokens.css"]).toBe(
      ":root {\n  --primary: #1d4ed8; /* blue */\n  --gap: 8px;\n}\n",
    );

    const unprefixed = patch(index, {
      kind: "setTokenValue",
      name: "gap",
      value: "16px",
    });
    expect(unprefixed.next["tokens.css"]).toContain("--gap: 16px;");
  });

  it("changes only the named mode value and inserts missing overrides", () => {
    const css =
      ':root {\n  --bg: white;\n  --gap: 8px;\n}\n[data-mode="dark"] {\n  --bg: black; /* night */\n}\n';
    const { next, result } = patch(buildIndex({ "tokens.css": css }), {
      kind: "setTokenValue",
      name: "--bg",
      value: "#111",
      mode: "dark",
    });
    expect(result.edits).toEqual([
      {
        file: "tokens.css",
        start: css.indexOf("black"),
        end: css.indexOf("black") + 5,
        text: "#111",
      },
    ]);
    expect(next["tokens.css"]).toBe(css.replace("black", "#111"));
    const inserted = patch(buildIndex(next), {
      kind: "setTokenValue",
      name: "--gap",
      value: "4px",
      mode: "dark",
    });
    expect(inserted.next["tokens.css"]).toContain(
      "  --bg: #111; /* night */\n  --gap: 4px;\n}",
    );
  });

  it("adds a mode with default values and rejects duplicate or unknown modes", () => {
    const css = ":root {\n  --bg: white;\n  --gap: 8px;\n}\n";
    const { next, result } = patch(buildIndex({ "tokens.css": css }), {
      kind: "addTokenMode",
      name: "dark",
    });
    expect(result.edits).toEqual([
      {
        file: "tokens.css",
        start: css.length,
        end: css.length,
        text: '\n[data-mode="dark"] {\n  --bg: white;\n  --gap: 8px;\n}\n',
      },
    ]);
    expect(next["tokens.css"]).toBe(css + result.edits[0]?.text);
    expect(() =>
      planPatch(buildIndex(next), { kind: "addTokenMode", name: "dark" }),
    ).toThrow(/already exists/);
    expect(() =>
      planPatch(buildIndex(next), {
        kind: "setTokenValue",
        name: "--bg",
        value: "black",
        mode: "missing",
      }),
    ).toThrow(/Unknown/);
  });

  it("renames mode selectors and Frame references, aliasing the default mode, then deletes them with fallback", () => {
    const css =
      ':root {\n  --bg: white;\n}\n\n[data-mode="dark"] {\n  --bg: black;\n}\n';
    const page =
      'import { Frame } from "@ombrique/runtime";\nexport default function Home() { return <Frame mode="dark" />; }\n';
    const renamed = patch(
      buildIndex({ "tokens.css": css, "pages/home.tsx": page }),
      { kind: "renameTokenMode", name: "dark", newName: "Night" },
    );
    expect(renamed.next["tokens.css"]).toBe(css.replace('"dark"', '"Night"'));
    expect(renamed.next["pages/home.tsx"]).toBe(
      page.replace('"dark"', '"Night"'),
    );

    const defaultRenamed = patch(
      buildIndex({ "tokens.css": ":root {\n  --bg: white;\n}\n" }),
      { kind: "renameTokenMode", name: "default", newName: "Light" },
    );
    expect(defaultRenamed.next["tokens.css"]).toBe(
      ':root, [data-mode="Light"] {\n  --bg: white;\n}\n',
    );

    const deleted = patch(buildIndex(renamed.next), {
      kind: "deleteTokenMode",
      name: "Night",
    });
    expect(deleted.next["tokens.css"]).toBe(":root {\n  --bg: white;\n}\n");
    expect(deleted.next["pages/home.tsx"]).not.toContain("mode=");
    expect(() =>
      planPatch(buildIndex(deleted.next), {
        kind: "deleteTokenMode",
        name: "default",
      }),
    ).toThrow(/default/);
  });

  it("uses current spans for sequential mode commands and unquoted selector renames", () => {
    const css = ":root { --bg: white }\n[data-mode=dark] { --bg: black }\n";
    const index = buildIndex({ "tokens.css": css });
    const renamed = patch(index, {
      kind: "renameTokenMode",
      name: "dark",
      newName: "Night mode",
    });
    const nextIndex = buildIndex(renamed.next);
    const result = planPatch(nextIndex, [
      {
        kind: "setTokenValue",
        name: "--bg",
        value: "#111",
        mode: "Night mode",
      },
      {
        kind: "setTokenValue",
        name: "--gap",
        value: "4px",
        mode: "Night mode",
      },
    ]);
    const next = applyEdits(renamed.next["tokens.css"] ?? "", result.edits);
    expect(next).toContain('[data-mode="Night mode"] { --bg: #111');
    expect(next).toContain("--gap: 4px;");
    expect(
      buildIndex({ "tokens.css": next }).styles.tokens.tokens[0]?.values,
    ).toEqual({ default: "white", "Night mode": "#111" });
  });
});

describe("planPatch: components", () => {
  it("createComponent extracts target JSX into components/{name}.tsx and replaces with <Name />", () => {
    const page = `import { Frame, Rect } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Rect data-name="CardBox" x={10} y={10} width={100} height={100} fill="#3b82f6" />
    </Frame>
  );
}
`;
    const index = buildIndex({ "pages/home.tsx": page });
    const target = indexPath(index, "pages/home.tsx", [0, 0]);
    const { next } = patch(index, {
      kind: "createComponent",
      target: target.ref,
      name: "Card",
    });

    expect(next["components/Card.tsx"]).toBeDefined();
    expect(next["components/Card.tsx"]).toContain("export function Card()");
    expect(next["components/Card.tsx"]).toContain(
      '<Rect data-name="CardBox" x={10} y={10} width={100} height={100} fill="#3b82f6" />',
    );
    expect(next["pages/home.tsx"]).toContain(
      'import { Card } from "../components/Card";',
    );
    expect(next["pages/home.tsx"]).toContain("<Card />");
    expect(next["pages/home.tsx"]).not.toContain('data-name="CardBox"');
  });

  it("detachInstance expands component JSX, cleans up unused import, and picks the matching variant branch", () => {
    const cardComp = `import { Rect } from "@ombrique/runtime";

export function Card() {
  return (
    <Rect data-name="CardBox" x={10} y={10} width={100} height={100} fill="#3b82f6" />
  );
}
`;
    const page = `import { Card } from "../components/Card";
import { Frame } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Card fill="#ff0000" />
    </Frame>
  );
}
`;
    const index = buildIndex({
      "components/Card.tsx": cardComp,
      "pages/home.tsx": page,
    });
    const target = indexPath(index, "pages/home.tsx", [0, 0]);
    const { next } = patch(index, {
      kind: "detachInstance",
      target: target.ref,
    });

    expect(next["pages/home.tsx"]).toContain('fill="#ff0000"');
    expect(next["pages/home.tsx"]).toContain('data-name="CardBox"');
    expect(next["pages/home.tsx"]).not.toContain(
      'import { Card } from "../components/Card";',
    );
    expect(next["pages/home.tsx"]).not.toContain("<Card");

    const buttonComp = `import { Rect } from "@ombrique/runtime";

export interface ButtonProps {
  size?: "small" | "large";
}

export function Button({ size = "small" }: ButtonProps) {
  if (size === "large") {
    return (
      <Rect data-name="BtnLarge" width={120} height={48} fill="#1d4ed8" />
    );
  }
  return (
    <Rect data-name="BtnSmall" width={80} height={32} fill="#3b82f6" />
  );
}
`;
    const variantPage = `import { Button } from "../components/Button";
import { Frame } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Button size="large" />
    </Frame>
  );
}
`;
    const variantIndex = buildIndex({
      "components/Button.tsx": buttonComp,
      "pages/home.tsx": variantPage,
    });
    const variantTarget = indexPath(variantIndex, "pages/home.tsx", [0, 0]);
    const variant = patch(variantIndex, {
      kind: "detachInstance",
      target: variantTarget.ref,
    });
    expect(variant.next["pages/home.tsx"]).toContain('data-name="BtnLarge"');
    expect(variant.next["pages/home.tsx"]).toContain("width={120}");
    expect(variant.next["pages/home.tsx"]).not.toContain(
      'data-name="BtnSmall"',
    );
  });

  it("createVariantSet extracts targets into parameterized component with props interface, default values, and axes", () => {
    const page = `import { Frame, Rect } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Rect data-name="ButtonSmall" x={10} y={10} width={80} height={32} fill="#3b82f6" />
      <Rect data-name="ButtonLarge" x={100} y={10} width={120} height={48} fill="#1d4ed8" />
    </Frame>
  );
}
`;
    const index = buildIndex({ "pages/home.tsx": page });
    const t0 = indexPath(index, "pages/home.tsx", [0, 0]);
    const t1 = indexPath(index, "pages/home.tsx", [0, 1]);

    const { next } = patch(index, {
      kind: "createVariantSet",
      targets: [t0.ref, t1.ref],
      name: "Button",
      axes: [{ name: "size", values: ["small", "large"] }],
    });

    expect(next["components/Button.tsx"]).toBeDefined();
    const compCode = next["components/Button.tsx"];
    expect(compCode).toContain("export interface ButtonProps");
    expect(compCode).toContain('size?: "small" | "large"');
    expect(compCode).toContain("export const variantAxes");
    expect(compCode).toContain("export function Button({");
    expect(compCode).toContain('size = "small"');
    expect(compCode).toContain('size === "large"');
    expect(compCode).toContain('data-name="ButtonSmall"');
    expect(compCode).toContain('data-name="ButtonLarge"');

    const pageCode = next["pages/home.tsx"];
    expect(pageCode).toContain(
      'import { Button } from "../components/Button";',
    );
    expect(pageCode).toContain('<Button size="small" />');
    expect(pageCode).toContain('<Button size="large" />');
    expect(pageCode).not.toContain('data-name="ButtonSmall"');
    expect(pageCode).not.toContain('data-name="ButtonLarge"');
  });

  it("createNodes creates component instance and inserts import statement", () => {
    const page = `import { Frame } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600} />
  );
}
`;
    const index = buildIndex({ "pages/home.tsx": page });
    const root = indexPath(index, "pages/home.tsx", [0]);

    const { next } = patch(index, {
      kind: "createNodes",
      parent: root.ref,
      pageFile: "pages/home.tsx",
      index: 0,
      specs: [
        {
          kind: "component",
          componentName: "Button",
          x: 20,
          y: 20,
          props: { size: "large" },
        },
      ],
    });

    expect(next["pages/home.tsx"]).toContain(
      'import { Button } from "../components/Button";',
    );
    expect(next["pages/home.tsx"]).toContain(
      '<Button x={20} y={20} size="large" />',
    );
  });
});

describe("planPatch: flattenBoolean", () => {
  it("flattens <Boolean> node into a single <path d='...' />", () => {
    const page = `import { Vector, Boolean } from "@ombrique/runtime";

export default function Home() {
  return (
    <Vector x={0} y={0} width={200} height={200}>
      <Boolean op="union" fill="#ff0000" data-name="UnionShape">
        <path d="M0 0 L50 0 L50 50 Z" />
        <path d="M50 50 L100 50 L100 100 Z" />
      </Boolean>
    </Vector>
  );
}
`;
    const index = buildIndex({ "pages/home.tsx": page });
    const target = indexPath(index, "pages/home.tsx", [0, 0]);
    const { next } = patch(index, {
      kind: "flattenBoolean",
      target: target.ref,
    });

    expect(next["pages/home.tsx"]).toContain(
      '<path d="M0 0 L50 0 L50 50 Z M50 50 L100 50 L100 100 Z" fill="#ff0000" data-name="UnionShape" />',
    );
    expect(next["pages/home.tsx"]).not.toContain("<Boolean");
  });
});
