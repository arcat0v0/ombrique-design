import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type ExportFormat,
  type ExportScaleConstraint,
  type ExportSetting,
  planExportFiles,
} from "@ombrique/protocol";

export function resolveExportScale(
  constraint: ExportScaleConstraint,
  nodeWidth: number,
): number {
  if (constraint.type === "scale") {
    return constraint.value;
  }
  const safeWidth = Math.max(1, nodeWidth);
  return Math.max(0.01, constraint.value / safeWidth);
}

export interface ExportItemPayload {
  filename: string;
  format: ExportFormat;
  bytes?: Uint8Array;
  svg?: string;
}

export interface WriteExportOptions {
  destDir?: string;
  singleFilePath?: string;
  items: ExportItemPayload[];
}

export async function writeExportedFiles(
  options: WriteExportOptions,
): Promise<string[]> {
  const written: string[] = [];

  if (options.singleFilePath && options.items.length > 0) {
    const item = options.items[0];
    if (!item) return written;
    mkdirSync(dirname(options.singleFilePath), { recursive: true });
    if (item.bytes) {
      writeFileSync(options.singleFilePath, Buffer.from(item.bytes));
    } else if (item.svg !== undefined) {
      writeFileSync(options.singleFilePath, item.svg, "utf8");
    }
    written.push(options.singleFilePath);
    return written;
  }

  if (options.destDir) {
    mkdirSync(options.destDir, { recursive: true });
    for (const item of options.items) {
      const target = join(options.destDir, item.filename);
      if (item.bytes) {
        writeFileSync(target, Buffer.from(item.bytes));
      } else if (item.svg !== undefined) {
        writeFileSync(target, item.svg, "utf8");
      }
      written.push(target);
    }
  }

  return written;
}

export interface ExecutePlanOptions {
  baseName: string;
  settings: ExportSetting[];
  dest:
    | { mode: "single"; filePath: string }
    | { mode: "directory"; dirPath: string };
  renderItem: (
    setting: ExportSetting,
    filename: string,
  ) => Promise<{ bytes?: Uint8Array; svg?: string }>;
}

export async function executeExportPlan(
  options: ExecutePlanOptions,
): Promise<string[]> {
  const planned = planExportFiles(options.baseName, options.settings);
  const items: ExportItemPayload[] = [];

  for (const { setting, filename } of planned) {
    const rendered = await options.renderItem(setting, filename);
    items.push({
      filename,
      format: setting.format,
      bytes: rendered.bytes,
      svg: rendered.svg,
    });
  }

  if (options.dest.mode === "single") {
    return writeExportedFiles({
      singleFilePath: options.dest.filePath,
      items,
    });
  }

  return writeExportedFiles({
    destDir: options.dest.dirPath,
    items,
  });
}
