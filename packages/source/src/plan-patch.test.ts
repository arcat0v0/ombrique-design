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

describe("planPatch: setStyle", () => {
  it("updates an existing style prop in place", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next, result } = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [["left", 100]],
    });
    expect(next["pages/home.tsx"]).toBe(PAGE.replace("left: 80", "left: 100"));
    expect(result.edits).toHaveLength(1);
    untouched(PAGE, next["pages/home.tsx"] ?? "", result.edits);
  });

  it("appends new props after existing ones", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [["background", "#000000"]],
    });
    expect(next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, top: 120, width: 400, background: "#000000" }}',
    );
  });

  it("removes props whose value is null", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [["top", null]],
    });
    expect(next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, width: 400 }}',
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

  it("creates a style attribute when missing", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const { next } = patch(index, {
      kind: "setStyle",
      target: sub.ref,
      declarations: [["left", 10]],
    });
    expect(next["pages/home.tsx"]).toContain(
      '<div data-name="Sub" hidden style={{ left: 10 }} />',
    );
  });

  it("handles update, insert, and remove in one command", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setStyle",
      target: hero.ref,
      declarations: [
        ["width", 500],
        ["top", null],
        ["background", "#111111"],
      ],
    });
    expect(next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, width: 500, background: "#111111" }}',
    );
  });
});

describe("planPatch: setText", () => {
  it("replaces the single JSX text child", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("text missing");
    const { next } = patch(index, {
      kind: "setText",
      target: text.ref,
      text: "新标题",
    });
    expect(next["pages/home.tsx"]).toContain(
      "<Text x={0} y={0} width={300} fontSize={24}>新标题</Text>",
    );
  });

  it("inserts after the opening tag when there is no text child", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setText",
      target: hero.ref,
      text: "X",
    });
    expect(next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, top: 120, width: 400 }}>X\n',
    );
  });

  it("expands a self-closing element to hold text", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const { next } = patch(index, {
      kind: "setText",
      target: sub.ref,
      text: "note",
    });
    expect(next["pages/home.tsx"]).toContain(
      '<div data-name="Sub" hidden>note</div>',
    );
  });
});

describe("planPatch: setAttrs", () => {
  it("adds a string attribute", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { "data-locked": "yes" },
    });
    expect(next["pages/home.tsx"]).toContain(
      'style={{ position: "absolute", left: 80, top: 120, width: 400 }} data-locked="yes">',
    );
  });

  it("modifies an existing attribute value", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { "data-name": "Hero2" },
    });
    expect(next["pages/home.tsx"]).toContain('data-name="Hero2"');
    expect(next["pages/home.tsx"]).not.toContain('data-name="Hero"');
  });

  it("removes an attribute when the value is null", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { "data-name": null },
    });
    expect(next["pages/home.tsx"]).toContain(
      '<div style={{ position: "absolute", left: 80, top: 120, width: 400 }}>',
    );
  });

  it("adds and removes boolean attributes as bare JSX attributes", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const withHidden = patch(index, {
      kind: "setAttrs",
      target: hero.ref,
      attrs: { hidden: true },
    });
    expect(withHidden.next["pages/home.tsx"]).toContain(
      "width: 400 }} hidden>",
    );
    const sub = byName(index, "pages/home.tsx", "Sub");
    const withoutHidden = patch(index, {
      kind: "setAttrs",
      target: sub.ref,
      attrs: { hidden: false },
    });
    expect(withoutHidden.next["pages/home.tsx"]).toContain(
      '<div data-name="Sub" />',
    );
  });

  it("writes numeric attributes in braces", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const { next } = patch(index, {
      kind: "setAttrs",
      target: sub.ref,
      attrs: { count: 3 },
    });
    expect(next["pages/home.tsx"]).toContain("count={3}");
  });

  it("escapes quotes inside string attribute values", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const { next } = patch(index, {
      kind: "setAttrs",
      target: sub.ref,
      attrs: { "data-name": 'a"b' },
    });
    expect(next["pages/home.tsx"]).toContain('data-name="a\\"b"');
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
    expect(next).toContain("<Image");
    expect(next).toContain('data-name="Cover"');
    expect(next).toContain('src="/assets/cover.png"');
    expect(next).toContain("radius={12}");
  });

  const rect = {
    kind: "rect",
    name: "Box",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    fill: "#ff0000",
  } as const;

  it("appends generated nodes at the child index", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
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
    expect(next["pages/home.tsx"]).toContain(heroBlock);
  });

  it("inserts before an existing child", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "createNodes",
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 0,
      specs: [rect],
    });
    const lines = (next["pages/home.tsx"] ?? "").split("\n");
    const rectIdx = lines.findIndex((l) => l.includes("<Rect"));
    const textIdx = lines.findIndex((l) => l.includes("<Text"));
    expect(rectIdx).toBeGreaterThan(-1);
    expect(textIdx).toBe(rectIdx + 1);
  });

  it("uses the page root when parent is null", () => {
    const index = makeIndex();
    const { next } = patch(index, {
      kind: "createNodes",
      parent: null,
      pageFile: "pages/home.tsx",
      index: 1,
      specs: [rect],
    });
    const lines = (next["pages/home.tsx"] ?? "").split("\n");
    const rectIdx = lines.findIndex((l) => l.includes("<Rect"));
    const frameCloseIdx = lines.findIndex((l) => l.includes("</Frame>"));
    expect(rectIdx).toBeGreaterThan(-1);
    expect(rectIdx).toBe(frameCloseIdx - 1);
    expect(lines[rectIdx]?.startsWith("      ")).toBe(true);
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
      '<Text style={{ position: "absolute", left: 1, top: 2, width: 3, fontSize: 12 }}>hello</Text>',
    );
  });

  it("supports styling the created node after re-indexing", () => {
    const index = makeIndex();
    const hero = byName(index, "pages/home.tsx", "Hero");
    const first = patch(index, {
      kind: "createNodes",
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 2,
      specs: [rect],
    });
    const second = patch(buildIndex(first.next), {
      kind: "createNodes",
      parent: null,
      pageFile: "pages/board.tsx",
      index: 1,
      specs: [rect],
    });
    const created = byName(buildIndex(first.next), "pages/home.tsx", "Box");
    const third = patch(buildIndex(first.next), {
      kind: "setStyle",
      target: created.ref,
      declarations: [["left", 99]],
    });
    expect(third.next["pages/home.tsx"]).toContain("left: 99");
    expect(second.next["pages/board.tsx"]).toContain("<Rect");
  });
});

describe("planPatch: deleteNodes", () => {
  it("deletes a whole element including its line", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const { next, result } = patch(index, {
      kind: "deleteNodes",
      targets: [sub.ref],
    });
    expect(next["pages/home.tsx"]).toBe(
      PAGE.replace('        <div data-name="Sub" hidden />\n', ""),
    );
    expect(result.edits).toHaveLength(1);
  });

  it("merges adjacent deletions into one edit", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    const sub = byName(index, "pages/home.tsx", "Sub");
    if (!text) throw new Error("text missing");
    const { next, result } = patch(index, {
      kind: "deleteNodes",
      targets: [sub.ref, text.ref],
    });
    expect(result.edits).toHaveLength(1);
    expect(next["pages/home.tsx"]).toContain(
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
  it("moves an element into another parent at an index", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const frame = index.byPath("pages/home.tsx", [0]);
    if (!frame) throw new Error("frame missing");
    const { next, result } = patch(index, {
      kind: "reparent",
      target: sub.ref,
      parent: frame.ref,
      pageFile: "pages/home.tsx",
      index: 0,
    });
    expect(result.edits).toHaveLength(2);
    const lines = (next["pages/home.tsx"] ?? "").split("\n");
    const subIdx = lines.findIndex((l) => l.includes('data-name="Sub"'));
    const heroIdx = lines.findIndex((l) => l.includes('data-name="Hero"'));
    expect(subIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBe(subIdx + 1);
    expect(lines[subIdx]).toBe('      <div data-name="Sub" hidden />');
    expect(next["pages/home.tsx"]).not.toContain(
      '<div data-name="Sub" hidden />\n      </div>',
    );
  });

  it("reorders within the same parent", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const hero = byName(index, "pages/home.tsx", "Hero");
    const { next } = patch(index, {
      kind: "reparent",
      target: sub.ref,
      parent: hero.ref,
      pageFile: "pages/home.tsx",
      index: 0,
    });
    const lines = (next["pages/home.tsx"] ?? "").split("\n");
    const subIdx = lines.findIndex((l) => l.includes('data-name="Sub"'));
    const textIdx = lines.findIndex((l) => l.includes("<Text"));
    expect(subIdx).toBe(textIdx - 1);
    expect(lines[subIdx]).toBe('        <div data-name="Sub" hidden />');
  });

  it("expands a self-closing destination", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    const sub = byName(index, "pages/home.tsx", "Sub");
    if (!text) throw new Error("text missing");
    const { next } = patch(index, {
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
    expect(next["pages/home.tsx"]).toContain(block);
    expect(next["pages/home.tsx"]).not.toContain("标题</Text>\n      </div>");
  });

  it("moves elements across files", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    const lane = byName(index, "pages/board.tsx", "Lane");
    if (!text) throw new Error("text missing");
    const { next, result } = patch(index, {
      kind: "reparent",
      target: text.ref,
      parent: lane.ref,
      pageFile: "pages/board.tsx",
      index: 0,
    });
    expect(result.changedFiles).toContain("pages/home.tsx");
    expect(result.changedFiles).toContain("pages/board.tsx");
    expect(next["pages/home.tsx"] ?? "").not.toContain("标题");
    expect(next["pages/board.tsx"]).toContain(
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

  it("duplicates a runtime node with x/y props when no style left/top exist", () => {
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
  });

  it("keeps the duplicate adjacent after the original", () => {
    const index = makeIndex();
    const sub = byName(index, "pages/home.tsx", "Sub");
    const { next } = patch(index, {
      kind: "duplicateNode",
      target: sub.ref,
      dx: 20,
      dy: 20,
    });
    const lines = (next["pages/home.tsx"] ?? "").split("\n");
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

  it("keeps grouped children re-indexed for later commands", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    if (!text) throw new Error("missing target");
    const hero = byName(index, "pages/home.tsx", "Hero");
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

  it("rejects grouping a node with its own ancestor", () => {
    const index = makeIndex();
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
  });

  it("group → ungroup round-trip preserves the AST structure", () => {
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
    const restored = buildIndex(ungrouped.next);
    const heroAfter = byName(restored, "pages/home.tsx", "Hero");
    expect(heroAfter.children).toHaveLength(2);
    expect(heroAfter.children[0]?.tag).toBe("Text");
    expect(heroAfter.children[1]?.dataAttrs["data-name"]).toBe("Sub");
  });
});
describe("planPatch: pages", () => {
  it("addPage creates a page file and edits the manifest", () => {
    const index = makeIndex();
    const { next, result } = patch(index, { kind: "addPage", name: "About" });
    expect(result.changedFiles).toContain("pages/about.tsx");
    expect(result.changedFiles).toContain("ombrique.json");
    expect(next["pages/about.tsx"]).toBe(
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
    expect(next["ombrique.json"]).toBe(
      '{\n  "formatVersion": 1,\n  "pages": [\n    { "id": "home", "name": "Home", "file": "pages/home.tsx" },\n    { "id": "board", "name": "Board", "file": "pages/board.tsx" },\n    { "id": "about", "name": "About", "file": "pages/about.tsx" }\n  ]\n}\n',
    );
  });

  it("deduplicates slugs for addPage", () => {
    const index = makeIndex();
    const { next } = patch(index, { kind: "addPage", name: "Board" });
    expect(next["pages/board-2.tsx"]).toContain(
      "export default function Board2()",
    );
    expect(next["ombrique.json"]).toContain('"file": "pages/board-2.tsx"');
  });

  it("slugifies page names", () => {
    const index = makeIndex();
    const { next } = patch(index, { kind: "addPage", name: "My Settings!" });
    expect(next["pages/my-settings.tsx"]).toContain('name="My Settings!"');
    expect(next["ombrique.json"]).toContain('"id": "my-settings"');
  });

  it("renamePage only rewrites the manifest name", () => {
    const index = makeIndex();
    const { next, result } = patch(index, {
      kind: "renamePage",
      pageId: "home",
      name: "Main",
    });
    expect(result.changedFiles).toEqual(["ombrique.json"]);
    expect(next["ombrique.json"]).toContain(
      '{ "id": "home", "name": "Main", "file": "pages/home.tsx" }',
    );
    expect(next["pages/home.tsx"]).toBe(PAGE);
  });

  it("deletePage removes the manifest entry and reports the file", () => {
    const index = makeIndex();
    const { next, result } = patch(index, {
      kind: "deletePage",
      pageId: "board",
    });
    expect(result.meta.deletedPageFile).toBe("pages/board.tsx");
    expect(next["ombrique.json"]).not.toContain("pages/board.tsx");
    expect(next["pages/board.tsx"]).toBe(PAGE2);
  });

  it("deletePage removes a middle entry with its comma", () => {
    const index = makeIndex();
    const { next } = patch(index, { kind: "deletePage", pageId: "home" });
    const manifest = next["ombrique.json"] ?? "";
    expect(manifest).not.toContain("pages/home.tsx");
    expect(manifest).toContain("pages/board.tsx");
    expect(manifest).toBe(
      '{\n  "formatVersion": 1,\n  "pages": [\n    { "id": "board", "name": "Board", "file": "pages/board.tsx" }\n  ]\n}\n',
    );
  });
});

describe("planPatch: multi-command", () => {
  it("applies commands sequentially with path re-anchoring", () => {
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
  });

  it("re-anchors after deletions shifted later siblings", () => {
    const index = makeIndex();
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    const sub = byName(index, "pages/home.tsx", "Sub");
    if (!text) throw new Error("text missing");
    const { next } = patch(index, [
      { kind: "deleteNodes", targets: [sub.ref] },
      { kind: "setText", target: text.ref, text: "仍在" },
    ]);
    const code = next["pages/home.tsx"] ?? "";
    expect(code).toContain(">仍在</Text>");
    expect(code).not.toContain("Sub");
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

describe("planPatch: performance", () => {
  it("plans a setStyle on a 200-node page in under 50ms", () => {
    const lines: string[] = [
      'import { Frame } from "@ombrique/runtime";',
      "",
      "export default function Big() {",
      "  return (",
      '    <Frame name="Big" x={0} y={0} width={1000} height={1000}>',
    ];
    for (let i = 0; i < 200; i++) {
      lines.push(
        `      <div data-name="N${i}" style={{ left: ${i}, top: 0, width: 10, height: 10 }} />`,
      );
    }
    lines.push("    </Frame>", "  );", "}");
    const page = `${lines.join("\n")}\n`;
    const index = buildIndex({ "pages/big.tsx": page });
    const target = byName(index, "pages/big.tsx", "N199");
    const start = performance.now();
    const result = planPatch(index, {
      kind: "setStyle",
      target: target.ref,
      declarations: [["left", 42]],
    });
    const elapsed = performance.now() - start;
    const next = applyEdits(page, result.edits);
    expect(next).toContain("left: 42");
    expect(elapsed).toBeLessThan(50);
  });
});

describe("planPatch: setSharedStyle", () => {
  it("replaces declaration value using exact span", () => {
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
  });

  it("rejects path traversal", () => {
    const index = makeIndex();
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
  it("updates an existing token in tokens.css preserving comments and indentation", () => {
    const css = ":root {\n  --primary: #3b82f6; /* blue */\n  --gap: 8px;\n}\n";
    const index = buildIndex({ "tokens.css": css });
    const { next, result } = patch(index, {
      kind: "setTokenValue",
      name: "--primary",
      value: "#1d4ed8",
    });
    expect(result.edits).toHaveLength(1);
    expect(next["tokens.css"]).toBe(
      ":root {\n  --primary: #1d4ed8; /* blue */\n  --gap: 8px;\n}\n",
    );
  });

  it("updates token given name without -- prefix", () => {
    const css = ":root {\n  --gap: 8px;\n}\n";
    const index = buildIndex({ "tokens.css": css });
    const { next } = patch(index, {
      kind: "setTokenValue",
      name: "gap",
      value: "16px",
    });
    expect(next["tokens.css"]).toContain("--gap: 16px;");
  });

  it("creates tokens.css with :root if file does not exist", () => {
    const index = makeIndex();
    const { next, result } = patch(index, {
      kind: "createToken",
      name: "brand",
      value: "#10b981",
    });
    expect(result.edits).toHaveLength(1);
    expect(next["tokens.css"]).toBe(":root {\n  --brand: #10b981;\n}\n");
  });

  it("appends new token into existing :root block", () => {
    const css = ":root {\n  --primary: #3b82f6;\n}\n";
    const index = buildIndex({ "tokens.css": css });
    const { next } = patch(index, {
      kind: "createToken",
      name: "--radius-md",
      value: "6px",
    });
    expect(next["tokens.css"]).toBe(
      ":root {\n  --primary: #3b82f6;\n  --radius-md: 6px;\n}\n",
    );
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

  it("detachInstance expands component JSX and cleans up unused import", () => {
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

describe("planPatch: runtime import injection", () => {
  it("groupNodes adds the missing Group import", () => {
    const page = `import { Frame, Rect } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Rect data-name="A" x={10} y={10} width={50} height={50} fill="#111111" />
      <Rect data-name="B" x={70} y={10} width={50} height={50} fill="#222222" />
    </Frame>
  );
}
`;
    const index = buildIndex({ "pages/home.tsx": page });
    const a = indexPath(index, "pages/home.tsx", [0, 0]);
    const b = indexPath(index, "pages/home.tsx", [0, 1]);
    const root = indexPath(index, "pages/home.tsx", [0]);
    const { next } = patch(index, {
      kind: "groupNodes",
      targets: [a.ref, b.ref],
      parent: root.ref,
      pageFile: "pages/home.tsx",
      index: 0,
      name: "Pair",
    });
    const code = next["pages/home.tsx"] ?? "";
    expect(code).toContain("<Group");
    expect(code).toMatch(
      /import \{ Frame, Rect, Group \} from "@ombrique\/runtime";/,
    );
  });

  it("createNodes with an image spec adds the Image import", () => {
    const page = `import { Frame } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600} />
  );
}
`;
    const index = buildIndex({ "pages/home.tsx": page });
    const { next } = patch(index, {
      kind: "createNodes",
      parent: null,
      pageFile: "pages/home.tsx",
      index: 1,
      specs: [
        {
          kind: "image",
          name: "Logo",
          x: 10,
          y: 10,
          width: 100,
          height: 60,
          src: "assets/logo.png",
        },
      ],
    });
    const code = next["pages/home.tsx"] ?? "";
    expect(code).toContain("<Image");
    expect(code).toMatch(
      /import \{ Frame, Image \} from "@ombrique\/runtime";/,
    );
  });
});
