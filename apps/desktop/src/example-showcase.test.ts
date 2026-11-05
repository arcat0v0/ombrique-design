import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDesignFile } from "@ombrique/source";

const exampleRoot = resolve(import.meta.dirname, "../../../example-project");

describe("example showcase token consumption", () => {
  const source = readFileSync(join(exampleRoot, "pages/showcase.tsx"), "utf8");
  const parsed = parseDesignFile("pages/showcase.tsx", source);

  it("keeps the multi-axis fixture contract", () => {
    expect(parsed.root?.dataAttrs["data-mode"]).toBe("dark");
    expect(parsed.root?.dataAttrs["data-density"]).toBe("condensed");
    expect(parsed.elements.filter((el) => el.tag === "Icon")).toHaveLength(1);
    expect(parsed.elements.filter((el) => el.tag === "IconBadge")).toHaveLength(
      2,
    );
    const icon = parsed.elements.find((el) => el.tag === "Icon");
    expect(icon?.dataAttrs["data-name"]).toBe("Sparkles");
    expect(icon?.attrs.iconName?.value).toBe("sparkles");
  });

  it("paints every showcase fill from color tokens", () => {
    const fills = parsed.elements
      .map((el) => el.attrs.fill?.value)
      .filter((value): value is string => typeof value === "string");
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) expect(fill).toMatch(/^var\(--color-[a-z-]+\)$/);
  });

  it("spaces the showcase through space tokens", () => {
    const styleValues = parsed.elements.flatMap((el) =>
      el.style.map((prop) => prop.value),
    );
    expect(styleValues).toContain("var(--space-6)");
    expect(styleValues).toContain("var(--space-4)");
    expect(
      parsed.elements.some(
        (el) =>
          el.style.some((prop) => prop.key === "padding") &&
          el.style.some((prop) => prop.key === "gap"),
      ),
    ).toBe(true);
  });

  it("keeps auto-layout children relatively positioned instead of absolutely", () => {
    const primitiveTags = new Set([
      "Text",
      "Icon",
      "Rect",
      "Ellipse",
      "Star",
      "Image",
    ]);
    const autoLayoutParents = parsed.elements.filter((el) => {
      const layout = el.attrs.layout?.value;
      return layout === "vertical" || layout === "horizontal";
    });
    expect(autoLayoutParents.length).toBeGreaterThanOrEqual(2);
    const flowChildren = autoLayoutParents.flatMap((parent) =>
      parent.children.filter((child) => primitiveTags.has(child.tag)),
    );
    expect(flowChildren.map((child) => child.tag).sort()).toEqual([
      "Icon",
      "Rect",
      "Text",
      "Text",
    ]);
    for (const child of flowChildren) {
      expect(
        child.style.find((prop) => prop.key === "position")?.value,
        `${child.tag} ${child.path.join("/")} must stay in auto-layout flow`,
      ).toBe("relative");
    }
  });

  it("keeps component badges on color and space tokens", () => {
    const badgeSource = readFileSync(
      join(exampleRoot, "components/IconBadge.tsx"),
      "utf8",
    );
    const badge = parseDesignFile("components/IconBadge.tsx", badgeSource);
    expect(badge.elements.map((el) => el.tag)).toEqual(["Frame", "Text"]);
    expect(badgeSource).toContain("var(--color-primary)");
    expect(badgeSource).toContain("var(--color-on-primary)");
    expect(badgeSource).toContain("var(--color-border)");
    expect(badgeSource).toContain("var(--color-fg)");
    const badgeStyles = badge.elements.flatMap((el) =>
      el.style.map((prop) => `${prop.key}:${prop.value}`),
    );
    expect(badgeStyles).toContain("left:var(--space-4)");
    expect(badgeStyles).toContain("top:var(--space-2)");
  });
});
