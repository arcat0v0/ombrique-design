import type { CanvasTool } from "@ombrique/editor-ui";

const CANVAS_TOOLS: readonly CanvasTool[] = [
  "select",
  "hand",
  "frame",
  "rect",
  "ellipse",
  "star",
  "pen",
  "text",
  "comment",
];

export function resolveCanvasTool(payload: unknown): CanvasTool | null {
  const tool =
    typeof payload === "string"
      ? payload
      : ((payload as { tool?: string } | null)?.tool ?? null);
  return CANVAS_TOOLS.find((valid) => valid === tool) ?? null;
}
