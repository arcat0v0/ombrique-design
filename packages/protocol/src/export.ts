import { z } from "zod";

export const exportFormatSchema = z.enum(["png", "jpg", "webp", "svg", "pdf"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportScaleConstraintSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scale"),
    value: z.number().positive(),
  }),
  z.object({
    type: z.literal("width"),
    value: z.number().int().positive(),
  }),
]);
export type ExportScaleConstraint = z.infer<typeof exportScaleConstraintSchema>;

export const exportSettingSchema = z.object({
  id: z.string().min(1),
  format: exportFormatSchema,
  scale: exportScaleConstraintSchema,
  suffix: z.string().default(""),
});
export type ExportSetting = z.infer<typeof exportSettingSchema>;

export function parseScaleInput(input: string): ExportScaleConstraint {
  const raw = input.trim().toLowerCase();
  if (!raw) return { type: "scale", value: 1 };
  if (raw.endsWith("w") || raw.endsWith("px")) {
    const num = Number.parseInt(raw.replace(/[wpx]/g, ""), 10);
    if (Number.isFinite(num) && num > 0) {
      return { type: "width", value: num };
    }
    return { type: "scale", value: 1 };
  }
  if (raw.endsWith("x")) {
    const num = Number.parseFloat(raw.slice(0, -1));
    if (Number.isFinite(num) && num > 0) {
      return { type: "scale", value: num };
    }
    return { type: "scale", value: 1 };
  }
  const directNum = Number.parseFloat(raw);
  if (Number.isFinite(directNum) && directNum > 0) {
    if (directNum >= 10 && Number.isInteger(directNum)) {
      return { type: "width", value: directNum };
    }
    return { type: "scale", value: directNum };
  }
  return { type: "scale", value: 1 };
}

export function formatScaleLabel(constraint: ExportScaleConstraint): string {
  if (constraint.type === "width") {
    return `${constraint.value}w`;
  }
  return `${constraint.value}x`;
}

export function serializeExportSettings(settings: ExportSetting[]): string {
  if (!settings || settings.length === 0) return "";
  return settings
    .map((s) => {
      const scaleStr = formatScaleLabel(s.scale);
      const safeSuffix = s.suffix
        ? s.suffix.replace(/[:;]/g, (c) => encodeURIComponent(c))
        : "";
      const suffixPart = safeSuffix ? `:${safeSuffix}` : "";
      return `${scaleStr}:${s.format}${suffixPart}`;
    })
    .join(";");
}

let rowCounter = 0;
export function createExportSettingId(): string {
  rowCounter += 1;
  return `exp_${Date.now()}_${rowCounter}`;
}

export function parseExportSettings(
  raw: string | null | undefined,
): ExportSetting[] {
  if (!raw || typeof raw !== "string") return [];
  const parts = raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const result: ExportSetting[] = [];
  for (const part of parts) {
    const pieces = part.split(":");
    if (pieces.length < 2 || pieces.length > 3) continue;
    const [scaleStr, formatStr, rawSuffix] = pieces;
    const formatParsed = exportFormatSchema.safeParse(formatStr?.toLowerCase());
    if (!formatParsed.success) continue;
    const scale = parseScaleInput(scaleStr ?? "1x");
    let suffix = "";
    if (rawSuffix) {
      try {
        suffix = decodeURIComponent(rawSuffix);
      } catch {
        suffix = rawSuffix;
      }
    }
    result.push({
      id: createExportSettingId(),
      format: formatParsed.data,
      scale,
      suffix,
    });
  }
  return result;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  let result = "";
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    result += code < 32 ? "_" : (cleaned[i] ?? "");
  }
  return result || "export";
}

export function buildExportFilename(
  baseName: string,
  setting: ExportSetting,
): string {
  const safeBase = sanitizeFilename(baseName);
  const suffix = setting.suffix || "";
  return `${safeBase}${suffix}.${setting.format}`;
}

export function planExportFiles(
  baseName: string,
  settings: ExportSetting[],
): Array<{ setting: ExportSetting; filename: string }> {
  const counts = new Map<string, number>();
  const result: Array<{ setting: ExportSetting; filename: string }> = [];
  const safeBase = sanitizeFilename(baseName);

  for (const setting of settings) {
    const baseWithSuffix = `${safeBase}${setting.suffix || ""}`;
    const ext = setting.format;
    const key = `${baseWithSuffix}.${ext}`;
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);

    const filename =
      seen === 0 ? key : `${baseWithSuffix} (${seen + 1}).${ext}`;

    result.push({ setting, filename });
  }

  return result;
}

export const exportNodeRequestSchema = z.object({
  file: z.string().min(1),
  path: z.array(z.number().int().nonnegative()).optional(),
  name: z.string().min(1),
  settings: z.array(exportSettingSchema).min(1),
});
export type ExportNodeRequest = z.infer<typeof exportNodeRequestSchema>;

export const canvasExportRequestSchema = z.object({
  requestId: z.string().min(1),
  file: z.string().min(1),
  path: z.array(z.number().int().nonnegative()).optional(),
  format: z.enum(["png", "jpg", "webp", "svg"]),
  scale: z.number().positive(),
  targetWidth: z.number().positive().optional(),
});
export type CanvasExportRequest = z.infer<typeof canvasExportRequestSchema>;

export const canvasExportResponseSchema = z.object({
  requestId: z.string().min(1),
  ok: z.boolean(),
  error: z.string().optional(),
  format: z.enum(["png", "jpg", "webp", "svg"]).optional(),
  bytes: z.any().optional(),
  svg: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type CanvasExportResponse = z.infer<typeof canvasExportResponseSchema>;
