import { describe, expect, it } from "vitest";
import { parseDesignFile } from "./parse-design-file.js";
import type { DesignElement } from "./types.js";

const PAGE = `import { Frame, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400 }}>
        <Text x={0} y={0} width={300} fontSize={24} className="title">标题</Text>
        <div data-name="Sub" hidden />
      </div>
    </Frame>
  );
}
`;

function byName(
  root: DesignElement | null,
  name: string,
): DesignElement | undefined {
  if (!root) return undefined;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.dataAttrs["data-name"] === name) return current;
    for (const child of current.children) stack.push(child);
  }
  return undefined;
}

describe("parseDesignFile", () => {
  const parsed = parseDesignFile("pages/home.tsx", PAGE);

  it("exposes the root frame with a stable ref and path", () => {
    expect(parsed.root).toBeDefined();
    const root = parsed.root;
    if (!root) throw new Error("root missing");
    expect(root.tag).toBe("Frame");
    expect(root.kind).toBe("runtime");
    expect(root.path).toEqual([0]);
    expect(PAGE.slice(root.ref.start, root.ref.end).startsWith("<Frame")).toBe(
      true,
    );
    expect(
      PAGE.slice(root.openingSpan.start, root.openingSpan.end).endsWith(">"),
    ).toBe(true);
  });

  it("classifies kinds: intrinsic, runtime, component", () => {
    const componentPage = `export default function P() { return <Card><div /><Frame2 /></Card>; }`;
    const p2 = parseDesignFile("pages/c.tsx", componentPage);
    const tags = p2.elements.map((e) => [e.tag, e.kind]);
    expect(tags).toContainEqual(["Card", "component"]);
    expect(tags).toContainEqual(["div", "intrinsic"]);
    expect(tags).toContainEqual(["Frame2", "component"]);
  });

  it("assigns sibling-index paths for nested children", () => {
    const hero = byName(parsed.root ?? null, "Hero");
    const text = parsed.elements.find((e) => e.tag === "Text");
    const sub = byName(parsed.root ?? null, "Sub");
    expect(hero?.path).toEqual([0, 0]);
    expect(text?.path).toEqual([0, 0, 0]);
    expect(sub?.path).toEqual([0, 0, 1]);
  });

  it("reads literal style props with spans into source", () => {
    const hero = byName(parsed.root ?? null, "Hero");
    if (!hero) throw new Error("hero missing");
    expect(hero.style).toHaveLength(4);
    const position = hero.style[0];
    if (!position) throw new Error("position missing");
    expect(position.key).toBe("position");
    expect(position.value).toBe("absolute");
    expect(position.dynamic).toBe(false);
    expect(
      PAGE.slice(position.valueSpan?.start ?? 0, position.valueSpan?.end ?? 0),
    ).toBe('"absolute"');
    const left = hero.style[1];
    if (!left) throw new Error("left missing");
    expect(left.value).toBe(80);
    expect(
      PAGE.slice(left.valueSpan?.start ?? 0, left.valueSpan?.end ?? 0),
    ).toBe("80");
    const top = hero.style[2];
    if (!top) throw new Error("top missing");
    expect(PAGE.slice(top.keySpan.start, top.keySpan.end)).toBe("top");
    expect(PAGE.slice(top.propSpan.start, top.propSpan.end)).toBe("top: 120");
  });

  it("reads negative numbers through unary minus", () => {
    const code = `<div style={{ left: -12, top: +5 }} />;
`;
    const p = parseDesignFile(
      "pages/n.tsx",
      `export default function N() { return (${code.slice(0, -2)}); }\n`,
    );
    const div = p.elements.find((e) => e.tag === "div");
    expect(div?.style[0]?.value).toBe(-12);
    expect(div?.style[1]?.value).toBe(5);
  });

  it("marks non-literal style values as dynamic", () => {
    const code = `export default function N() { return <div style={{ left: x, top: "a" + "b", width: 4 }} />; }`;
    const p = parseDesignFile("pages/d.tsx", code);
    const div = p.elements[0];
    expect(div?.style[0]?.dynamic).toBe(true);
    expect(div?.style[0]?.value).toBeNull();
    expect(div?.style[1]?.dynamic).toBe(true);
    expect(div?.style[2]?.dynamic).toBe(false);
  });

  it("reads static string, number, and boolean attributes", () => {
    const root = parsed.root;
    if (!root) throw new Error("root missing");
    expect(root.attrs.name).toMatchObject({ kind: "string", value: "Home" });
    expect(root.attrs.width).toMatchObject({ kind: "number", value: 1440 });
    expect(root.attrs.fill?.value).toBe("#ffffff");
    const sub = byName(root, "Sub");
    expect(sub?.attrs.hidden).toMatchObject({ kind: "boolean", value: true });
  });

  it("collects data-* attributes separately", () => {
    const hero = byName(parsed.root ?? null, "Hero");
    expect(hero?.dataAttrs).toEqual({ "data-name": "Hero" });
  });

  it("reads className static and dynamic forms", () => {
    const text = parsed.elements.find((e) => e.tag === "Text");
    expect(text?.className?.staticValue).toBe("title");
    expect(text?.className?.text).toBe('"title"');
    const code = `export default function N() { return <div className={styles.box} />; }`;
    const p = parseDesignFile("pages/c2.tsx", code);
    expect(p.elements[0]?.className?.staticValue).toBeNull();
    expect(p.elements[0]?.className?.text).toBe("styles.box");
  });

  it("exposes text children spans", () => {
    const text = parsed.elements.find((e) => e.tag === "Text");
    expect(text?.texts).toHaveLength(1);
    expect(text?.texts[0]?.value).toBe("标题");
    expect(
      PAGE.slice(text?.textSpan?.start ?? 0, text?.textSpan?.end ?? 0),
    ).toBe("标题");
  });

  it("leaves textSpan null for multiple text children", () => {
    const code = `export default function N() { return <Text>a {x} b</Text>; }`;
    const p = parseDesignFile("pages/m.tsx", code);
    expect(p.elements[0]?.texts).toHaveLength(2);
    expect(p.elements[0]?.textSpan).toBeNull();
  });

  it("flags generated subtrees inside expression containers", () => {
    const gen = `import { Frame } from "@ombrique/runtime";
export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={100} height={100}>
      {show && <div data-name="A" />}
      {cond ? <div data-name="B" /> : <span data-name="C" />}
      {items.map((item) => (
        <div data-name="D">
          <div data-name="E" />
        </div>
      ))}
    </Frame>
  );
}
`;
    const p = parseDesignFile("pages/gen.tsx", gen);
    const names = ["A", "B", "C", "D", "E"];
    for (const name of names) {
      const el = byName(p.root ?? null, name);
      expect(el?.generated).toBe(true);
      expect(el?.kind).toBe("intrinsic");
    }
    expect(p.root?.generated).toBe(false);
    const d = byName(p.root ?? null, "D");
    const e = byName(p.root ?? null, "E");
    expect(d?.path).toEqual([0, 3]);
    expect(e?.path).toEqual([0, 3, 0]);
    expect(e?.generated).toBe(true);
  });

  it("returns null root for files without JSX", () => {
    const p = parseDesignFile("pages/empty.tsx", `export const x = 1;\n`);
    expect(p.root).toBeNull();
    expect(p.elements).toHaveLength(0);
  });
});
