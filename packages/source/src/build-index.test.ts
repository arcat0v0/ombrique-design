import { describe, expect, it } from "vitest";
import { buildIndex } from "./build-index.js";
import type { DesignElement } from "./types.js";

const HOME = `import { Frame, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400 }}>
        <Text x={0} y={0} width={300} fontSize={24}>标题</Text>
      </div>
    </Frame>
  );
}
`;

const ABOUT = `import { Frame } from "@ombrique/runtime";

export default function About() {
  return <Frame name="About" x={10} y={20} width={800} height={600} />;
}
`;

const MANIFEST = `{
  "formatVersion": 1,
  "pages": [
    { "id": "home", "name": "Home", "file": "pages/home.tsx" },
    { "id": "about", "name": "About", "file": "pages/about.tsx" }
  ]
}
`;

const SCSS = `.card {\n  color: red;\n  .label { font-size: 12px; }\n}\n`;

function makeFiles(): Record<string, string> {
  return {
    "ombrique.json": MANIFEST,
    "pages/home.tsx": HOME,
    "pages/about.tsx": ABOUT,
    "styles/app.module.scss": SCSS,
  };
}

describe("buildIndex", () => {
  const index = buildIndex(makeFiles());

  it("builds pages from the manifest with root frame geometry", () => {
    expect(index.pages.map((p) => p.id)).toEqual(["home", "about"]);
    const home = index.pages[0];
    if (!home) throw new Error("home missing");
    expect(home.name).toBe("Home");
    expect(home.file).toBe("pages/home.tsx");
    expect(home.x).toBe(0);
    expect(home.y).toBe(0);
    expect(home.width).toBe(1440);
    expect(home.height).toBe(900);
    expect(home.frameName).toBe("Home");
    const about = index.pages[1];
    expect(about?.width).toBe(800);
    expect(about?.frameName).toBe("About");
  });

  it("resolves elements by ref and by path", () => {
    const hero = [...index.elements.values()].find(
      (e) => e.dataAttrs["data-name"] === "Hero",
    );
    if (!hero) throw new Error("hero missing");
    expect(index.byRef(hero.ref)).toBe(hero);
    expect(
      index.byRef({ file: "pages/home.tsx", start: 99999, end: 100000 }),
    ).toBeUndefined();
    expect(index.byPath("pages/home.tsx", [0, 0])?.tag).toBe("div");
    expect(index.byPath("pages/home.tsx", [0, 0, 0])?.tag).toBe("Text");
    expect(index.byPath("pages/home.tsx", [])).toBeUndefined();
    expect(index.byPath("pages/home.tsx", [0, 9])).toBeUndefined();
  });

  it("indexes stylesheet rules by class", () => {
    const label = index.styles.byClass.get("label");
    expect(label).toHaveLength(1);
    expect(label?.[0]?.fullSelector).toBe(".card .label");
    expect(index.styles.byClass.get("card")?.[0]?.decls[0]?.value).toBe("red");
    expect(
      index.styles.files.get("styles/app.module.scss")?.rules,
    ).toHaveLength(2);
  });

  it("synthesizes pages when the manifest is absent", () => {
    const idx = buildIndex({ "pages/home.tsx": HOME });
    expect(idx.manifest).toBeNull();
    expect(idx.pages).toHaveLength(1);
    expect(idx.pages[0]?.file).toBe("pages/home.tsx");
    expect(idx.pages[0]?.width).toBe(1440);
  });
});

describe("element tree shape", () => {
  it("links parent pointers", () => {
    const index = buildIndex(makeFiles());
    const hero = index.byPath("pages/home.tsx", [0, 0]) as DesignElement;
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    expect(text?.parent).toBe(hero);
    expect(hero.parent?.tag).toBe("Frame");
  });
});

describe("stylesheet indexing", () => {
  it("indexes .css files and tokens.css rules", () => {
    const index = buildIndex({
      "tokens.css": ":root {\n  --primary: #3b82f6;\n  --gap-sm: 8px;\n}\n",
    });
    const tokens = index.styles.files.get("tokens.css");
    const rootRule = tokens?.rules[0];
    const firstDecl = rootRule?.decls[0];
    expect(tokens).toBeDefined();
    expect(rootRule?.decls).toHaveLength(2);
    expect(firstDecl?.prop).toBe("--primary");
    expect(firstDecl?.value).toBe("#3b82f6");
  });

  it("indexes default and named token modes without duplicate tokens", () => {
    const css =
      ':root {\n  --bg: white;\n  --gap: 8px;\n}\n[data-mode="dark"] {\n  --bg: black;\n}\n';
    const index = buildIndex({ "tokens.css": css });
    expect(
      index.styles.tokens.modes.map((mode) => ({
        name: mode.name,
        isDefault: mode.isDefault,
      })),
    ).toEqual([
      { name: "default", isDefault: true },
      { name: "dark", isDefault: false },
    ]);
    expect(
      index.styles.tokens.tokens.map((token) => ({
        name: token.name,
        value: token.value,
        values: token.values,
      })),
    ).toEqual([
      {
        name: "--bg",
        value: "white",
        values: { default: "white", dark: "black" },
      },
      { name: "--gap", value: "8px", values: { default: "8px" } },
    ]);
    const dark = index.styles.tokens.modes[1];
    expect(
      css.slice(dark?.rules[0]?.ruleSpan.start, dark?.rules[0]?.ruleSpan.end),
    ).toBe('[data-mode="dark"] {\n  --bg: black;\n}');
  });

  it("keeps empty modes and a named default selector alias", () => {
    const index = buildIndex({
      "tokens.css":
        ':root, [data-mode="Light"] { --bg: white; }\n[data-mode="Compact"] {}\n',
    });
    expect(index.styles.tokens.modes.map((mode) => mode.name)).toEqual([
      "Light",
      "Compact",
    ]);
    expect(index.styles.tokens.tokens).toHaveLength(1);
    expect(index.styles.tokens.tokens[0]?.values).toEqual({ Light: "white" });
  });
});

describe("component scanning and variant axes", () => {
  it("scans exported components in components/ and extracts variant axes", () => {
    const btnCode = `import { Frame, Text } from "@ombrique/runtime";

export interface ButtonProps {
  size?: "small" | "medium" | "large";
  state?: "default" | "hover";
}

export const variantAxes = [
  { name: "size", values: ["small", "medium", "large"] },
  { name: "state", values: ["default", "hover"] }
];

export function Button({ size = "medium", state = "default" }: ButtonProps) {
  return (
    <Frame name="Button" width={100} height={36}>
      <Text>Click me</Text>
    </Frame>
  );
}
`;
    const cardCode = `import { Rect } from "@ombrique/runtime";

export interface CardProps {
  variant?: "primary" | "secondary";
}

export function Card({ variant = "primary" }: CardProps) {
  return <Rect name="Card" width={200} height={100} />;
}
`;
    const index = buildIndex({
      "ombrique.json": MANIFEST,
      "pages/home.tsx": HOME,
      "components/Button.tsx": btnCode,
      "components/Card.tsx": cardCode,
    });

    expect(index.components).toHaveLength(2);
    const btn = index.components.find((c) => c.name === "Button");
    if (!btn) throw new Error("Button component missing");
    expect(btn.file).toBe("components/Button.tsx");
    expect(btn.axes).toHaveLength(2);
    expect(btn.axes[0]?.name).toBe("size");
    expect(btn.axes[0]?.values).toEqual(["small", "medium", "large"]);
    expect(btn.axes[1]?.name).toBe("state");
    expect(btn.axes[1]?.values).toEqual(["default", "hover"]);

    const card = index.components.find((c) => c.name === "Card");
    if (!card) throw new Error("Card component missing");
    expect(card.axes).toEqual([
      { name: "variant", values: ["primary", "secondary"] },
    ]);
  });
});
