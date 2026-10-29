import { describe, expect, it } from "vitest";
import { parseStylesheet } from "./parse-stylesheet.js";

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

  it("expands nested selectors to full class paths", () => {
    const selectors = sheet.rules.map((r) => r.fullSelector);
    expect(selectors).toContain(".card");
    expect(selectors).toContain(".card .label");
    expect(selectors).toContain(".card:hover");
    expect(selectors).toContain(".card.active");
    expect(selectors).toContain(".card.focus");
    expect(selectors).toContain(".card > .child");
  });

  it("emits one rule entry per expanded selector with the same decls", () => {
    expect(sheet.rules).toHaveLength(6);
    const active = sheet.rules.find((r) => r.fullSelector === ".card.active");
    const focus = sheet.rules.find((r) => r.fullSelector === ".card.focus");
    expect(active?.decls).toHaveLength(1);
    expect(focus?.decls).toHaveLength(1);
    expect(active?.decls[0]?.value).toBe("green");
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

  it("keeps comments out of rules and declarations", () => {
    for (const rule of sheet.rules) {
      expect(rule.selector).not.toContain("comment");
      for (const decl of rule.decls) {
        expect(decl.prop).not.toMatch(/comment/);
      }
    }
  });

  it("handles top-level multiple selectors", () => {
    const code = `.a, .b { color: black; }\n`;
    const s = parseStylesheet("styles/x.scss", code);
    expect(s.rules.map((r) => r.fullSelector).sort()).toEqual([".a", ".b"]);
  });

  it("exposes selector spans for the nested selector as written", () => {
    const label = sheet.rules.find((r) => r.fullSelector === ".card .label");
    if (!label) throw new Error("label missing");
    expect(SCSS.slice(label.selectorSpan.start, label.selectorSpan.end)).toBe(
      ".label",
    );
  });
});
