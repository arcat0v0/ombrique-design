import { describe, expect, it } from "vitest";
import { buildIndex, locateByPath } from "./build-index.js";
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

  it("keeps manifest and manifest file path", () => {
    expect(index.manifest?.formatVersion).toBe(1);
    expect(index.manifestFile).toBe("ombrique.json");
  });

  it("resolves elements by ref", () => {
    const hero = [...index.elements.values()].find(
      (e) => e.dataAttrs["data-name"] === "Hero",
    );
    if (!hero) throw new Error("hero missing");
    const found = index.byRef(hero.ref);
    expect(found).toBe(hero);
    expect(
      index.byRef({ file: "pages/home.tsx", start: 99999, end: 100000 }),
    ).toBeUndefined();
  });

  it("resolves elements by path and locateByPath agrees", () => {
    const hero = index.byPath("pages/home.tsx", [0, 0]);
    expect(hero?.tag).toBe("div");
    const text = index.byPath("pages/home.tsx", [0, 0, 0]);
    expect(text?.tag).toBe("Text");
    expect(index.byPath("pages/home.tsx", [])).toBeUndefined();
    expect(index.byPath("pages/home.tsx", [0, 9])).toBeUndefined();
    expect(locateByPath(index, "pages/home.tsx", [0, 0])).toBe(hero);
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

  it("builds indexes for more than ten files in under 100ms", () => {
    const files: Record<string, string> = { "ombrique.json": MANIFEST };
    for (let i = 0; i < 12; i++) {
      files[`pages/page${i}.tsx`] = HOME.replace("Home", `Page${i}`).replace(
        "pages/home.tsx",
        `pages/page${i}.tsx`,
      );
      files[`styles/s${i}.module.scss`] = SCSS;
    }
    const start = performance.now();
    const idx = buildIndex(files);
    const elapsed = performance.now() - start;
    expect(idx.elements.size).toBeGreaterThan(30);
    expect(idx.styles.byClass.size).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
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
});
