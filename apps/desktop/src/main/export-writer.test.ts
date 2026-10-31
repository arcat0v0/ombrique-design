import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExportSetting } from "@ombrique/protocol";
import {
  executeExportPlan,
  resolveExportScale,
  writeExportedFiles,
} from "./export-writer";

describe("export-writer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ombrique-export-test-"));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("resolveExportScale", () => {
    it("returns scale factor when type is scale", () => {
      expect(resolveExportScale({ type: "scale", value: 2 }, 100)).toBe(2);
      expect(resolveExportScale({ type: "scale", value: 0.5 }, 100)).toBe(0.5);
    });

    it("calculates scale factor from target width", () => {
      expect(resolveExportScale({ type: "width", value: 500 }, 100)).toBe(5);
      expect(resolveExportScale({ type: "width", value: 50 }, 100)).toBe(0.5);
    });
  });

  describe("writeExportedFiles", () => {
    it("writes binary bytes to single file path", async () => {
      const dest = join(tempDir, "output.png");
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const written = await writeExportedFiles({
        singleFilePath: dest,
        items: [
          {
            filename: "output.png",
            format: "png",
            bytes,
          },
        ],
      });

      expect(written).toEqual([dest]);
      expect(existsSync(dest)).toBe(true);
      const read = readFileSync(dest);
      expect(Array.from(read)).toEqual(Array.from(bytes));
    });

    it("writes multiple files into directory", async () => {
      const pngBytes = new Uint8Array([1, 2, 3]);
      const svgText = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

      const written = await writeExportedFiles({
        destDir: tempDir,
        items: [
          {
            filename: "icon.png",
            format: "png",
            bytes: pngBytes,
          },
          {
            filename: "icon.svg",
            format: "svg",
            svg: svgText,
          },
        ],
      });

      expect(written).toHaveLength(2);
      const iconPng = join(tempDir, "icon.png");
      const iconSvg = join(tempDir, "icon.svg");
      expect(existsSync(iconPng)).toBe(true);
      expect(existsSync(iconSvg)).toBe(true);
      expect(readFileSync(iconSvg, "utf8")).toBe(svgText);
    });
  });

  describe("executeExportPlan integration", () => {
    it("plans and writes multiple format files with deduplication", async () => {
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
          format: "svg",
          scale: { type: "scale", value: 1 },
          suffix: "",
        },
      ];

      const written = await executeExportPlan({
        baseName: "Button",
        settings,
        dest: { mode: "directory", dirPath: tempDir },
        renderItem: async (setting) => {
          if (setting.format === "svg") {
            return {
              svg: `<svg viewBox="0 0 100 50"><text>Button</text></svg>`,
            };
          }
          return {
            bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          };
        },
      });

      expect(written).toHaveLength(3);
      expect(existsSync(join(tempDir, "Button.png"))).toBe(true);
      expect(existsSync(join(tempDir, "Button (2).png"))).toBe(true);
      expect(existsSync(join(tempDir, "Button.svg"))).toBe(true);
    });
  });
});
