import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOKEN_AXIS,
  DEFAULT_TOKEN_VALUE,
  decodeTokenCellRef,
  parseStylesheet,
  parseTokenTable,
  resolveTokenValue,
} from "./parse-stylesheet.js";

function readExampleCss(): string {
  const host: unknown = globalThis;
  if (!host || typeof host !== "object" || !("process" in host))
    throw new Error("node:fs unavailable");
  const proc: unknown = host.process;
  if (!proc || typeof proc !== "object" || !("getBuiltinModule" in proc))
    throw new Error("node:fs unavailable");
  const getter: unknown = proc.getBuiltinModule;
  if (typeof getter !== "function") throw new Error("node:fs unavailable");
  const getBuiltinModule = getter as (this: unknown, name: string) => unknown;
  const fs: unknown = getBuiltinModule.call(proc, "fs");
  if (!fs || typeof fs !== "object" || !("readFileSync" in fs))
    throw new Error("node:fs unavailable");
  const reader: unknown = fs.readFileSync;
  if (typeof reader !== "function") throw new Error("node:fs unavailable");
  const readFileSync = reader as (path: URL, encoding: string) => string;
  return readFileSync(
    new URL("../../../example-project/tokens.css", import.meta.url),
    "utf8",
  );
}

const SCSS = `// header comment
.card {
  color: red;
  padding: 0 8px;
  .label { font-size: 12px; }
  &:hover { color: blue; }
  &.active, &.focus { color: green; }
  > .child { margin: 0; }
}
`;

describe("parseStylesheet", () => {
  const sheet = parseStylesheet("styles/app.module.scss", SCSS);

  it("expands nested and comma-separated selectors to one rule entry per full class path", () => {
    expect(sheet.rules).toHaveLength(6);
    const selectors = sheet.rules.map((r) => r.fullSelector);
    expect(selectors).toContain(".card");
    expect(selectors).toContain(".card .label");
    expect(selectors).toContain(".card:hover");
    expect(selectors).toContain(".card.active");
    expect(selectors).toContain(".card.focus");
    expect(selectors).toContain(".card > .child");
    const active = sheet.rules.find((r) => r.fullSelector === ".card.active");
    const focus = sheet.rules.find((r) => r.fullSelector === ".card.focus");
    expect(active?.decls).toHaveLength(1);
    expect(focus?.decls).toHaveLength(1);
    expect(active?.decls[0]?.value).toBe("green");

    const split = parseStylesheet(
      "styles/x.scss",
      `.a, .b { color: black; }\n`,
    );
    expect(split.rules.map((r) => r.fullSelector).sort()).toEqual([".a", ".b"]);
  });

  it("captures declarations with value spans matching source text", () => {
    const card = sheet.rules.find((r) => r.fullSelector === ".card");
    if (!card) throw new Error("card missing");
    expect(card.decls).toHaveLength(2);
    const color = card.decls[0];
    const padding = card.decls[1];
    if (!color || !padding) throw new Error("decls missing");
    expect(color.prop).toBe("color");
    expect(color.value).toBe("red");
    expect(SCSS.slice(color.valueSpan.start, color.valueSpan.end)).toBe("red");
    expect(SCSS.slice(color.propSpan.start, color.propSpan.end)).toBe(
      "color: red",
    );
    expect(padding.value).toBe("0 8px");
    expect(SCSS.slice(padding.valueSpan.start, padding.valueSpan.end)).toBe(
      "0 8px",
    );
  });

  it("exposes selector spans for the nested selector as written", () => {
    const label = sheet.rules.find((r) => r.fullSelector === ".card .label");
    if (!label) throw new Error("label missing");
    expect(SCSS.slice(label.selectorSpan.start, label.selectorSpan.end)).toBe(
      ".label",
    );
  });

  it("parses modes, empty modes, and values without requiring final semicolons", () => {
    const css =
      ':root { --bg: white }\n[data-mode="dark"] { --bg: black }\n[data-mode="Compact"] {}';
    const table = parseTokenTable(parseStylesheet("tokens.css", css));
    expect(table.modes.map((mode) => mode.name)).toEqual([
      "default",
      "dark",
      "Compact",
    ]);
    expect(table.tokens[0]?.values).toEqual({
      default: "white",
      dark: "black",
    });
    const decl = table.modes[1]?.rules[0]?.decls[0];
    expect(css.slice(decl?.valueSpan.start, decl?.valueSpan.end)).toBe("black");
  });
});

describe("parseTokenTable: axes", () => {
  it("derives axes, ordered rules, and cells addressable by (axis, axisValue)", () => {
    const css = `:root { --bg: white; --gap: 8px; }
[data-mode="dark"] { --bg: black; }
[data-density="condensed"] { --gap: 4px; }
[data-mode="dark"][data-density="condensed"] { --bg: #111; --gap: 2px; }
`;
    const table = parseTokenTable(parseStylesheet("tokens.css", css));
    expect(table.axes.map((axis) => axis.name)).toEqual([
      DEFAULT_TOKEN_AXIS,
      "mode",
      "density",
    ]);
    expect(table.axes.find((axis) => axis.name === "mode")?.values).toEqual([
      "dark",
    ]);
    expect(table.axes.find((axis) => axis.name === "density")?.values).toEqual([
      "condensed",
    ]);
    expect(
      table.rules.map((rule) => ({
        order: rule.order,
        specificity: rule.specificity,
        selectors: rule.selectors,
      })),
    ).toEqual([
      { order: 0, specificity: 1, selectors: [] },
      {
        order: 1,
        specificity: 1,
        selectors: [{ axis: "mode", value: "dark" }],
      },
      {
        order: 2,
        specificity: 1,
        selectors: [{ axis: "density", value: "condensed" }],
      },
      {
        order: 3,
        specificity: 2,
        selectors: [
          { axis: "mode", value: "dark" },
          { axis: "density", value: "condensed" },
        ],
      },
    ]);
    const bg = table.tokens.find((token) => token.name === "--bg");
    expect(bg?.axisValues[DEFAULT_TOKEN_AXIS]?.[DEFAULT_TOKEN_VALUE]).toEqual([
      expect.objectContaining({ value: "white" }),
    ]);
    expect(bg?.axisValues.mode?.dark?.map((cell) => cell.value)).toEqual([
      "black",
      "#111",
    ]);
    expect(
      bg?.axisValues.density?.condensed?.map((cell) => cell.value),
    ).toEqual(["#111"]);
    expect(resolveTokenValue(table, "--bg", {})).toBe("white");
    expect(resolveTokenValue(table, "--bg", { mode: "dark" })).toBe("black");
    expect(resolveTokenValue(table, "--bg", { density: "condensed" })).toBe(
      "white",
    );
    expect(
      resolveTokenValue(table, "--bg", { mode: "dark", density: "condensed" }),
    ).toBe("#111");
    expect(
      resolveTokenValue(table, "--gap", {
        mode: "dark",
        density: "condensed",
      }),
    ).toBe("2px");
  });

  it("resolves same-priority rules by tokens.css order", () => {
    const css = `:root { --bg: white; }
[data-mode="dark"] { --bg: black; }
[data-density="condensed"] { --bg: blue; }
`;
    const table = parseTokenTable(parseStylesheet("tokens.css", css));
    expect(table.rules.map((rule) => rule.order)).toEqual([0, 1, 2]);
    expect(table.rules.map((rule) => rule.specificity)).toEqual([1, 1, 1]);
    expect(
      resolveTokenValue(table, "--bg", {
        mode: "dark",
        density: "condensed",
      }),
    ).toBe("blue");
  });

  it("supports nested combination selectors and unknown axes", () => {
    const css = `:root { --bg: white; }
[data-mode="dark"] {
  --bg: black;
  &[data-density="condensed"] { --bg: #111; }
}
[data-brand="acme"] { --bg: #f00; }
`;
    const table = parseTokenTable(parseStylesheet("tokens.css", css));
    expect(table.axes.map((axis) => axis.name)).toEqual([
      DEFAULT_TOKEN_AXIS,
      "mode",
      "density",
      "brand",
    ]);
    expect(table.axes.find((axis) => axis.name === "brand")?.values).toEqual([
      "acme",
    ]);
    expect(table.rules[2]?.selectors).toEqual([
      { axis: "mode", value: "dark" },
      { axis: "density", value: "condensed" },
    ]);
    expect(
      resolveTokenValue(table, "--bg", {
        mode: "dark",
        density: "condensed",
      }),
    ).toBe("#111");
    expect(resolveTokenValue(table, "--bg", { brand: "acme" })).toBe("#f00");
    expect(resolveTokenValue(table, "--bg", { foo: "bar" })).toBe("white");
  });

  it("decodes default, legacy mode, and composite cell references", () => {
    const css = `:root { --bg: white; }
[data-mode="dark"] { --bg: black; }
[data-mode="Night mode"] { --bg: #222; }
[data-density="condensed"] { --bg: blue; }
[data-mode="dark"][data-density="condensed"] { --bg: #111; }
`;
    const table = parseTokenTable(parseStylesheet("tokens.css", css));
    expect(decodeTokenCellRef(undefined, table)).toEqual({
      kind: "default",
      selectors: [],
    });
    expect(decodeTokenCellRef("ombrique root", table)).toEqual({
      kind: "default",
      selectors: [],
    });
    expect(decodeTokenCellRef("dark", table)).toEqual({
      kind: "mode",
      mode: expect.objectContaining({ name: "dark" }),
      selectors: [{ axis: "mode", value: "dark" }],
    });
    expect(decodeTokenCellRef("Night mode", table)).toEqual({
      kind: "mode",
      mode: expect.objectContaining({ name: "Night mode" }),
      selectors: [{ axis: "mode", value: "Night mode" }],
    });
    expect(decodeTokenCellRef("ombrique mode---Night-20-mode", table)).toEqual({
      kind: "cell",
      selectors: [{ axis: "mode", value: "Night mode" }],
    });
    expect(decodeTokenCellRef("ombrique density---condensed", table)).toEqual({
      kind: "cell",
      selectors: [{ axis: "density", value: "condensed" }],
    });
    expect(
      decodeTokenCellRef("ombrique mode---dark density---condensed", table),
    ).toEqual({
      kind: "cell",
      selectors: [
        { axis: "mode", value: "dark" },
        { axis: "density", value: "condensed" },
      ],
    });
    expect(() => decodeTokenCellRef("missing", table)).toThrow(/Unknown/);
  });

  it("keeps mode-owned colors when a density-only rule is also active", () => {
    const css = readExampleCss();
    const table = parseTokenTable(parseStylesheet("tokens.css", css));
    expect(
      resolveTokenValue(table, "--color-bg", {
        mode: "dark",
        density: "regular",
      }),
    ).toBe("#14141a");
    expect(
      resolveTokenValue(table, "--color-fg", {
        mode: "dark",
        density: "regular",
      }),
    ).toBe("#f8fafc");
    expect(
      resolveTokenValue(table, "--space-4", {
        mode: "dark",
        density: "regular",
      }),
    ).toBe("16px");

    const correct = `:root { --color-bg: #ffffff; --space-4: 16px; }
[data-mode="dark"] { --color-bg: #14141a; --space-4: 12px; }
[data-density="regular"] { --space-4: 16px; }
`;
    const correctTable = parseTokenTable(
      parseStylesheet("tokens.css", correct),
    );
    expect(
      resolveTokenValue(correctTable, "--color-bg", {
        mode: "dark",
        density: "regular",
      }),
    ).toBe("#14141a");

    const broken = `:root { --color-bg: #ffffff; --space-4: 16px; }
[data-mode="dark"] { --color-bg: #14141a; --space-4: 12px; }
[data-density="regular"] { --color-bg: #ffffff; --space-4: 16px; }
`;
    const brokenTable = parseTokenTable(parseStylesheet("tokens.css", broken));
    expect(
      resolveTokenValue(brokenTable, "--color-bg", {
        mode: "dark",
        density: "regular",
      }),
    ).toBe("#ffffff");
  });

  it("resolves :root and single-axis rules by source order at equal specificity", () => {
    const rootFirst = `:root { --bg: white; }
[data-mode="dark"] { --bg: black; }
`;
    const rootLast = `[data-mode="dark"] { --bg: black; }
:root { --bg: white; }
`;
    const first = parseTokenTable(parseStylesheet("tokens.css", rootFirst));
    const last = parseTokenTable(parseStylesheet("tokens.css", rootLast));
    expect(first.rules.map((rule) => rule.specificity)).toEqual([1, 1]);
    expect(first.rules.map((rule) => rule.order)).toEqual([0, 1]);
    expect(resolveTokenValue(first, "--bg", { mode: "dark" })).toBe("black");
    expect(resolveTokenValue(last, "--bg", { mode: "dark" })).toBe("white");

    const combined = `:root { --bg: white; }
[data-mode="dark"] { --bg: black; }
[data-mode="dark"][data-density="condensed"] { --bg: #111; }
`;
    const combinedTable = parseTokenTable(
      parseStylesheet("tokens.css", combined),
    );
    expect(combinedTable.rules.map((rule) => rule.specificity)).toEqual([
      1, 1, 2,
    ]);
    expect(
      resolveTokenValue(combinedTable, "--bg", {
        mode: "dark",
        density: "condensed",
      }),
    ).toBe("#111");
  });
});
