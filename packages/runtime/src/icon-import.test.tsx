import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Icon } from "./Icon";
import { decodeIconNodes } from "./icon-codec";
import {
  parseIconifySet,
  parseSvgVector,
  svgToIconNodes,
  svgVectorToNodes,
} from "./icon-import";
import { registerIconSet, unregisterIconSet } from "./icon-registry";

const MDI_SNIPPET = String.raw`{"prefix":"mdi","lastModified":1737398331,"aliases":{"123":{"parent":"numeric"}},"width":24,"height":24,"icons":{"numeric":{"body":"<path fill=\"currentColor\" d=\"M4 17V9H2V7h4v10zm18-2a2 2 0 0 1-2 2h-4v-2h4v-2h-2v-2h2V9h-4V7h4a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 1-1.5 1.5a1.5 1.5 0 0 1 1.5 1.5zm-8 0v2H8v-4a2 2 0 0 1 2-2h2V9H8V7h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v2z\"/>"}}}`;

const TABLER_SNIPPET = String.raw`{"prefix":"tabler","lastModified":1793169158,"aliases":{},"width":24,"height":24,"icons":{"home":{"body":"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M5 12H3l9-9l9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7\"/><path d=\"M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6\"/></g>"},"circle-check":{"body":"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0\"/><path d=\"m9 12l2 2l4-4\"/></g>"}}}`;

const MATERIAL_SYMBOLS_SNIPPET = String.raw`{"prefix":"material-symbols","lastModified":1793168860,"aliases":{},"width":24,"height":24,"icons":{"home":{"body":"<path fill=\"currentColor\" d=\"M4 21V9l8-6l8 6v12h-6v-7h-4v7z\"/>"}}}`;

const LUCIDE_SNIPPET = String.raw`{"prefix":"lucide","lastModified":1793718134,"aliases":{"circle-alert":{"parent":"circle-exclamation-point"}},"width":24,"height":24,"icons":{"house":{"body":"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/></g>"},"circle-exclamation-point":{"body":"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 8v4m0 4h.01\"/></g>"}}}`;

const LUCIDE_STATIC_ALARM_CLOCK = `<!-- @license lucide-static v1.63.0 - ISC -->
<svg
  class="lucide lucide-alarm-clock"
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <circle cx="12" cy="13" r="8" />
  <path d="M12 9v4l2 2" />
  <path d="M5 3 2 6" />
  <path d="m22 6-3-3" />
  <path d="M6.38 18.7 4 21" />
  <path d="M17.64 18.67 20 21" />
</svg>
`;

const SHAPES_SVG = `<svg viewBox="0 0 20 20">
  <rect x="0" y="0" width="10" height="20" />
  <rect x="0" y="0" width="10" height="20" rx="2" ry="3" />
  <circle cx="5" cy="5" r="5" />
  <ellipse cx="5" cy="5" rx="5" ry="2" />
  <line x1="0" y1="0" x2="10" y2="10" />
  <polyline points="0,0 10,0 10,10" />
  <polygon points="0 0 10 0 10 10" />
</svg>`;

afterEach(cleanup);

describe("parseSvgVector: real lucide-static svg", () => {
  it("reads the viewBox, strokes and converts shapes to paths", () => {
    const vector = parseSvgVector(LUCIDE_STATIC_ALARM_CLOCK);
    expect(vector.viewBox).toBe("0 0 24 24");
    expect(vector.width).toBe(24);
    expect(vector.height).toBe(24);
    expect(vector.diagnostics).toEqual([]);
    expect(vector.paths).toHaveLength(6);
    expect(vector.paths[0]?.d).toBe("M4 13A8 8 0 0 1 20 13A8 8 0 0 1 4 13Z");
    expect(vector.paths[1]?.d).toBe("M12 9v4l2 2");
    expect(vector.paths[0]?.stroke).toBe("currentColor");
    expect(vector.paths[0]?.fill).toBe("none");
    expect(vector.paths[0]?.strokeWidth).toBe(2);
  });

  it("converts element records into icon nodes", () => {
    const nodes = svgVectorToNodes(
      parseSvgVector(LUCIDE_STATIC_ALARM_CLOCK).paths,
    );
    expect(nodes).toHaveLength(6);
    expect(nodes[0]?.tag).toBe("path");
    expect(nodes[0]?.attrs.d).toBe("M4 13A8 8 0 0 1 20 13A8 8 0 0 1 4 13Z");
    expect(nodes[0]?.attrs["stroke-width"]).toBe("2");
  });
});

describe("parseSvgVector: shape conversions", () => {
  it("converts rect, circle, ellipse, line, polyline and polygon", () => {
    const vector = parseSvgVector(SHAPES_SVG);
    expect(vector.viewBox).toBe("0 0 20 20");
    expect(vector.paths.map((path) => path.d)).toEqual([
      "M0 0H10V20H0Z",
      "M2 0H8A2 3 0 0 1 10 3V17A2 3 0 0 1 8 20H2A2 3 0 0 1 0 17V3A2 3 0 0 1 2 0Z",
      "M0 5A5 5 0 0 1 10 5A5 5 0 0 1 0 5Z",
      "M0 5A5 2 0 0 1 10 5A5 2 0 0 1 0 5Z",
      "M0 0L10 10",
      "M0 0L10 0L10 10",
      "M0 0L10 0L10 10Z",
    ]);
  });

  it("inherits paint from containers and reads inline styles", () => {
    const vector = parseSvgVector(
      `<svg viewBox="0 0 10 10">
        <g fill="none" stroke="#ff0000" stroke-width="1.5">
          <path d="M0 0L1 1" />
          <path d="M1 1L2 2" style="stroke: #00ff00; stroke-width: 3" />
        </g>
      </svg>`,
    );
    expect(vector.paths[0]).toMatchObject({
      fill: "none",
      stroke: "#ff0000",
      strokeWidth: 1.5,
    });
    expect(vector.paths[1]).toMatchObject({
      fill: "none",
      stroke: "#00ff00",
      strokeWidth: 3,
    });
  });

  it("derives a viewBox from width/height and falls back to the default", () => {
    const derived = parseSvgVector(
      `<svg width="16" height="32"><path d="M0 0L1 1" /></svg>`,
    );
    expect(derived.viewBox).toBe("0 0 16 32");
    expect(derived.diagnostics).toEqual([
      "viewBox missing; derived from width/height",
    ]);

    const fallback = parseSvgVector(`<svg><path d="M0 0L1 1" /></svg>`);
    expect(fallback.viewBox).toBe("0 0 24 24");
    expect(fallback.diagnostics).toEqual([
      "viewBox missing; falling back to 0 0 24 24",
    ]);
  });

  it("reports unsupported constructs instead of dropping them silently", () => {
    const vector = parseSvgVector(
      `<svg viewBox="0 0 10 10">
        <g transform="translate(2 2)"><path d="M0 0L1 1" /></g>
        <use href="#other" />
        <text x="0" y="0">hi</text>
      </svg>`,
    );
    expect(vector.paths).toHaveLength(1);
    expect(vector.diagnostics).toEqual([
      'transform="translate(2 2)" on <g> is not applied',
      "<use> is not supported",
      "<text> is not supported",
    ]);
  });

  it("throws when there is no svg element", () => {
    expect(() => parseSvgVector("<div />")).toThrow("no <svg> element");
  });

  it("returns icon nodes for a single svg", () => {
    const result = svgToIconNodes(
      `<svg viewBox="0 0 8 8"><rect width="8" height="8" fill="#123456" /></svg>`,
    );
    expect(result.viewBox).toBe("0 0 8 8");
    expect(result.nodes).toEqual([
      { tag: "path", attrs: { d: "M0 0H8V8H0Z", fill: "#123456" } },
    ]);
  });
});

describe("parseIconifySet: real Iconify collections", () => {
  it("parses mdi fill icons and rewrites aliases (api.iconify.design/mdi.json)", () => {
    const result = parseIconifySet(JSON.parse(MDI_SNIPPET));
    expect(result.diagnostics).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.set.name).toBe("mdi");
    expect(result.set.kind).toBe("fill");
    expect(result.set.viewBox).toBe("0 0 24 24");
    expect(result.set.aliases).toEqual({ "123": "numeric" });
    const nodes = decodeIconNodes(result.set.icons.numeric ?? "");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.attrs.fill).toBe("currentColor");
    expect(nodes[0]?.attrs.d).toContain("M4 17V9H2V7h4v10z");
  });

  it("parses tabler stroke icons and strips the collection paint (api.iconify.design/tabler.json)", () => {
    const result = parseIconifySet(JSON.parse(TABLER_SNIPPET));
    expect(result.set.kind).toBe("stroke");
    expect(result.set.defaultStrokeWidth).toBe(2);
    const nodes = decodeIconNodes(result.set.icons.home ?? "");
    expect(nodes).toHaveLength(2);
    expect(Object.keys(nodes[0]?.attrs ?? {})).toEqual(["d"]);
    expect(nodes[0]?.attrs.d).toBe(
      "M5 12H3l9-9l9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7",
    );
    expect(result.set.icons["circle-check"]).toBeDefined();
  });

  it("keeps material-symbols fills (api.iconify.design/material-symbols.json)", () => {
    const result = parseIconifySet(JSON.parse(MATERIAL_SYMBOLS_SNIPPET));
    expect(result.set.kind).toBe("fill");
    const nodes = decodeIconNodes(result.set.icons.home ?? "");
    expect(nodes).toEqual([
      {
        tag: "path",
        attrs: { d: "M4 21V9l8-6l8 6v12h-6v-7h-4v7z", fill: "currentColor" },
      },
    ]);
  });

  it("inherits aliased lucide icons through the parent (api.iconify.design/lucide.json)", () => {
    const result = parseIconifySet(JSON.parse(LUCIDE_SNIPPET));
    expect(result.set.kind).toBe("stroke");
    expect(result.set.aliases).toEqual({
      "circle-alert": "circle-exclamation-point",
    });
    const nodes = decodeIconNodes(
      result.set.icons["circle-exclamation-point"] ?? "",
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.attrs.d).toBe("M2 12A10 10 0 0 1 22 12A10 10 0 0 1 2 12Z");
    expect(nodes[1]?.attrs.d).toBe("M12 8v4m0 4h.01");
  });

  it("materializes aliases that override the icon box", () => {
    const result = parseIconifySet({
      prefix: "boxed",
      width: 24,
      height: 24,
      icons: { home: { body: '<path d="M0 0h24v24H0z" />' } },
      aliases: {
        "home-wide": { parent: "home", width: 32, height: 32, left: 4, top: 4 },
      },
    });
    expect(result.set.aliases["home-wide"]).toBeUndefined();
    expect(result.set.icons["home-wide"]).toBeDefined();
    expect(result.set.iconViewBoxes).toEqual({
      "home-wide": "4 4 32 32",
    });
  });

  it("skips aliases with unsupported transforms and reports them", () => {
    const result = parseIconifySet({
      prefix: "flip",
      icons: { arrow: { body: '<path d="M0 0h10v10H0z" />' } },
      aliases: {
        "arrow-mirrored": { parent: "arrow", hFlip: true },
        "arrow-none": { parent: "ghost" },
      },
    });
    expect(result.set.aliases["arrow-mirrored"]).toBeUndefined();
    expect(result.skipped).toEqual(["arrow-mirrored", "arrow-none"]);
    expect(result.diagnostics).toContain(
      "arrow-mirrored: rotate/hFlip/vFlip aliases are not supported",
    );
  });

  it("ignores chars and keeps name lookup", () => {
    const result = parseIconifySet({
      prefix: "chars",
      icons: { home: { body: '<path d="M0 0h5v5H0z" />' } },
      chars: { home: ["house", "building"] },
    });
    expect(result.set.icons.home).toBeDefined();
    expect(result.diagnostics).toEqual([
      "chars are ignored; icons are addressed by name only",
    ]);
  });

  it("rejects malformed input", () => {
    expect(() => parseIconifySet(null)).toThrow("must be an object");
    expect(() => parseIconifySet({ icons: {} })).toThrow("no prefix");
  });
});

describe("imported sets render through Icon", () => {
  it("renders an imported Iconify collection", () => {
    const { set } = parseIconifySet(JSON.parse(TABLER_SNIPPET));
    registerIconSet(set);
    try {
      const { container } = render(
        <Icon iconSet="tabler" iconName="home" width={32} height={32} />,
      );
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("data-icon-set")).toBe("tabler");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg?.getAttribute("fill")).toBe("none");
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
      expect(svg?.querySelectorAll("path")).toHaveLength(2);
    } finally {
      unregisterIconSet("tabler");
    }
  });

  it("renders an imported icon with its own box", () => {
    const { set } = parseIconifySet({
      prefix: "boxed",
      width: 24,
      height: 24,
      icons: { dot: { body: '<path d="M0 0h4v4H0z" />' } },
      aliases: { "dot-wide": { parent: "dot", width: 8, height: 4 } },
    });
    registerIconSet(set);
    try {
      const { container } = render(
        <Icon iconSet="boxed" iconName="dot-wide" width={32} height={16} />,
      );
      expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(
        "0 0 8 4",
      );
    } finally {
      unregisterIconSet("boxed");
    }
  });
});
