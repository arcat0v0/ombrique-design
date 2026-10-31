import { describe, expect, it } from "vitest";
import {
  buildExportFilename,
  canvasExportRequestSchema,
  canvasExportResponseSchema,
  exportNodeRequestSchema,
  formatScaleLabel,
  parseExportSettings,
  parseScaleInput,
  planExportFiles,
  sanitizeFilename,
  serializeExportSettings,
  type ExportSetting,
} from "./export";

describe("parseScaleInput", () => {
  it("parses scale multiplier notations", () => {
    expect(parseScaleInput("1x")).toEqual({ type: "scale", value: 1 });
    expect(parseScaleInput("0.5x")).toEqual({ type: "scale", value: 0.5 });
    expect(parseScaleInput("2X")).toEqual({ type: "scale", value: 2 });
    expect(parseScaleInput("3")).toEqual({ type: "scale", value: 3 });
    expect(parseScaleInput("4x")).toEqual({ type: "scale", value: 4 });
  });

  it("parses width in pixels / w notation", () => {
    expect(parseScaleInput("512w")).toEqual({ type: "width", value: 512 });
    expect(parseScaleInput("1024W")).toEqual({ type: "width", value: 1024 });
    expect(parseScaleInput("800px")).toEqual({ type: "width", value: 800 });
  });

  it("falls back to 1x for invalid inputs", () => {
    expect(parseScaleInput("")).toEqual({ type: "scale", value: 1 });
    expect(parseScaleInput("abc")).toEqual({ type: "scale", value: 1 });
    expect(parseScaleInput("-2x")).toEqual({ type: "scale", value: 1 });
  });
});

describe("formatScaleLabel", () => {
  it("formats scale and width constraints", () => {
    expect(formatScaleLabel({ type: "scale", value: 2 })).toBe("2x");
    expect(formatScaleLabel({ type: "scale", value: 0.5 })).toBe("0.5x");
    expect(formatScaleLabel({ type: "width", value: 512 })).toBe("512w");
  });
});

describe("serialize and parse exportSettings", () => {
  it("roundtrips export setting list", () => {
    const settings: ExportSetting[] = [
      {
        id: "row-1",
        format: "png",
        scale: { type: "scale", value: 1 },
        suffix: "",
      },
      {
        id: "row-2",
        format: "png",
        scale: { type: "scale", value: 2 },
        suffix: "@2x",
      },
      {
        id: "row-3",
        format: "svg",
        scale: { type: "scale", value: 1 },
        suffix: "-vector",
      },
      {
        id: "row-4",
        format: "jpg",
        scale: { type: "width", value: 640 },
        suffix: "",
      },
    ];

    const serialized = serializeExportSettings(settings);
    expect(serialized).toBe("1x:png;2x:png:@2x;1x:svg:-vector;640w:jpg");

    const parsed = parseExportSettings(serialized);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toMatchObject({
      format: "png",
      scale: { type: "scale", value: 1 },
      suffix: "",
    });
    expect(parsed[1]).toMatchObject({
      format: "png",
      scale: { type: "scale", value: 2 },
      suffix: "@2x",
    });
    expect(parsed[2]).toMatchObject({
      format: "svg",
      scale: { type: "scale", value: 1 },
      suffix: "-vector",
    });
    expect(parsed[3]).toMatchObject({
      format: "jpg",
      scale: { type: "width", value: 640 },
      suffix: "",
    });
  });

  it("handles empty or malformed strings gracefully", () => {
    expect(parseExportSettings("")).toEqual([]);
    expect(parseExportSettings(null)).toEqual([]);
    expect(parseExportSettings(undefined)).toEqual([]);
    expect(parseExportSettings("garbage:invalid:extra:too:many")).toEqual([]);
  });
});

describe("filenames and deduplication", () => {
  it("sanitizes dangerous filename characters", () => {
    expect(sanitizeFilename("Header / Hero : Section?")).toBe(
      "Header _ Hero _ Section_",
    );
    expect(sanitizeFilename("")).toBe("export");
  });

  it("builds filename with suffix and extension", () => {
    const file = buildExportFilename("Card", {
      id: "1",
      format: "png",
      scale: { type: "scale", value: 2 },
      suffix: "@2x",
    });
    expect(file).toBe("Card@2x.png");
  });

  it("plans export files and de-duplicates identical names", () => {
    const settings: ExportSetting[] = [
      {
        id: "1",
        format: "png",
        scale: { type: "scale", value: 1 },
        suffix: "",
      },
      {
        id: "2",
        format: "png",
        scale: { type: "scale", value: 2 },
        suffix: "",
      },
      {
        id: "3",
        format: "png",
        scale: { type: "scale", value: 3 },
        suffix: "",
      },
    ];
    const planned = planExportFiles("Banner", settings);
    expect(planned.map((p) => p.filename)).toEqual([
      "Banner.png",
      "Banner (2).png",
      "Banner (3).png",
    ]);
  });
});

describe("export zod schemas", () => {
  it("validates exportNodeRequestSchema", () => {
    const valid = {
      file: "pages/home.tsx",
      path: [0, 1],
      name: "HeroButton",
      settings: [
        {
          id: "r1",
          format: "pdf",
          scale: { type: "scale", value: 1 },
          suffix: "",
        },
      ],
    };
    expect(exportNodeRequestSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      file: "",
      name: "",
      settings: [],
    };
    expect(exportNodeRequestSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates canvas export request and response schemas", () => {
    const req = {
      requestId: "exp-123",
      file: "pages/home.tsx",
      path: [0],
      format: "png",
      scale: 2,
    };
    expect(canvasExportRequestSchema.safeParse(req).success).toBe(true);

    const res = {
      requestId: "exp-123",
      ok: true,
      format: "png",
      width: 400,
      height: 200,
      bytes: new Uint8Array([1, 2, 3]),
    };
    expect(canvasExportResponseSchema.safeParse(res).success).toBe(true);
  });
});
