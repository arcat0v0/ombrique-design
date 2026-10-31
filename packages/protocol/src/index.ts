import { z } from "zod";

export const nodeRefSchema = z.object({
  file: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  path: z.array(z.number().int().nonnegative()).optional(),
});
export type NodeRef = z.infer<typeof nodeRefSchema>;

export const cssValueSchema = z.union([z.string(), z.number()]);
export type CssValue = z.infer<typeof cssValueSchema>;

export const declarationSchema = z.tuple([
  z.string().min(1),
  cssValueSchema.nullable(),
]);
export type Declaration = z.infer<typeof declarationSchema>;

export const frameSpecSchema = z.object({
  kind: z.literal("frame"),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fill: z.string().optional(),
  radius: z.number().nonnegative().optional(),
  radiusTopLeft: z.number().nonnegative().optional(),
  radiusTopRight: z.number().nonnegative().optional(),
  radiusBottomRight: z.number().nonnegative().optional(),
  radiusBottomLeft: z.number().nonnegative().optional(),
});
export type FrameSpec = z.infer<typeof frameSpecSchema>;

export const shapeSpecSchema = z.object({
  kind: z.enum(["rect", "ellipse", "star"]),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fill: z.string().optional(),
  radius: z.number().nonnegative().optional(),
  radiusTopLeft: z.number().nonnegative().optional(),
  radiusTopRight: z.number().nonnegative().optional(),
  radiusBottomRight: z.number().nonnegative().optional(),
  radiusBottomLeft: z.number().nonnegative().optional(),
});
export type ShapeSpec = z.infer<typeof shapeSpecSchema>;

export const pathSpecSchema = z.object({
  kind: z.literal("path"),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  d: z.string(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
});
export type PathSpec = z.infer<typeof pathSpecSchema>;

export const textSpecSchema = z.object({
  kind: z.literal("text"),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  fontSize: z.number().positive().optional(),
  fill: z.string().optional(),
});
export type TextSpec = z.infer<typeof textSpecSchema>;

export const imageSpecSchema = z.object({
  kind: z.literal("image"),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  src: z.string().min(1),
  radius: z.number().nonnegative().optional(),
});
export type ImageSpec = z.infer<typeof imageSpecSchema>;
export const componentSpecSchema = z.object({
  kind: z.literal("component"),
  componentName: z.string().min(1),
  name: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  props: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});
export type ComponentSpec = z.infer<typeof componentSpecSchema>;

export const variantAxisSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.string().min(1)).min(2),
});
export type VariantAxis = z.infer<typeof variantAxisSchema>;

export const nodeSpecSchema = z.discriminatedUnion("kind", [
  frameSpecSchema,
  shapeSpecSchema,
  pathSpecSchema,
  textSpecSchema,
  imageSpecSchema,
  componentSpecSchema,
]);
export type NodeSpec = z.infer<typeof nodeSpecSchema>;

export const tokenModeNameSchema = z
  .string()
  .min(1)
  .regex(/^[\p{L}\p{N}_-]+(?: [\p{L}\p{N}_-]+)*$/u);

export const editCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("setStyle"),
    target: nodeRefSchema,
    declarations: z.array(declarationSchema).min(1),
  }),
  z.object({
    kind: z.literal("setText"),
    target: nodeRefSchema,
    text: z.string(),
  }),
  z.object({
    kind: z.literal("setAttrs"),
    target: nodeRefSchema,
    attrs: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  }),
  z.object({
    kind: z.literal("createNodes"),
    parent: nodeRefSchema.nullable(),
    pageFile: z.string().min(1),
    index: z.number().int().nonnegative(),
    specs: z.array(nodeSpecSchema).min(1),
  }),
  z.object({
    kind: z.literal("deleteNodes"),
    targets: z.array(nodeRefSchema).min(1),
  }),
  z.object({
    kind: z.literal("duplicateNode"),
    target: nodeRefSchema,
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({
    kind: z.literal("reparent"),
    target: nodeRefSchema,
    parent: nodeRefSchema.nullable(),
    pageFile: z.string().min(1),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("addPage"),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("renamePage"),
    pageId: z.string().min(1),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("deletePage"),
    pageId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("groupNodes"),
    targets: z.array(nodeRefSchema).min(1),
    parent: nodeRefSchema.nullable(),
    pageFile: z.string().min(1),
    index: z.number().int().nonnegative(),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("ungroupNode"),
    target: nodeRefSchema,
  }),
  z.object({
    kind: z.literal("setSharedStyle"),
    file: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("setTokenValue"),
    name: z.string().min(1),
    value: z.string(),
    mode: tokenModeNameSchema.optional(),
  }),
  z.object({
    kind: z.literal("createToken"),
    name: z.string().min(1),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("addTokenMode"),
    name: tokenModeNameSchema,
  }),
  z.object({
    kind: z.literal("renameTokenMode"),
    name: tokenModeNameSchema,
    newName: tokenModeNameSchema,
  }),
  z.object({
    kind: z.literal("deleteTokenMode"),
    name: tokenModeNameSchema,
  }),
  z.object({
    kind: z.literal("createComponent"),
    target: nodeRefSchema,
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("detachInstance"),
    target: nodeRefSchema,
  }),
  z.object({
    kind: z.literal("flattenBoolean"),
    target: nodeRefSchema,
  }),
  z.object({
    kind: z.literal("createVariantSet"),
    targets: z.array(nodeRefSchema).min(2),
    name: z.string().min(1),
    axes: z
      .array(
        z.object({
          name: z.string().min(1),
          values: z.array(z.string().min(1)).min(2),
        }),
      )
      .min(1),
  }),
]);
export type EditCommand = z.infer<typeof editCommandSchema>;

export const manifestPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  file: z.string().min(1),
});
export type ManifestPage = z.infer<typeof manifestPageSchema>;

export const manifestSchema = z.object({
  formatVersion: z.literal(1),
  pages: z.array(manifestPageSchema),
});
export type Manifest = z.infer<typeof manifestSchema>;

export const shellToDocSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("openProject"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("applyCommands"),
    commands: z.array(editCommandSchema).min(1),
    baseVersions: z.array(z.string()),
  }),
  z.object({ kind: z.literal("undo") }),
  z.object({ kind: z.literal("redo") }),
  z.object({
    kind: z.literal("restoreVersion"),
    files: z.record(z.string(), z.string()),
  }),
]);
export type ShellToDoc = z.infer<typeof shellToDocSchema>;

export const diagnosticItemSchema = z.object({
  file: z.string(),
  message: z.string(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  severity: z.enum(["error", "warning"]),
});
export type DiagnosticItem = z.infer<typeof diagnosticItemSchema>;

export const appliedTransactionSchema = z.object({
  id: z.string().min(1),
  changedFiles: z.array(z.string()),
  versions: z.record(z.string(), z.string()),
  origin: z.enum(["designer", "external"]),
});
export type AppliedTransaction = z.infer<typeof appliedTransactionSchema>;

export const docToShellSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manifestChanged"),
    manifest: manifestSchema,
  }),
  z.object({
    kind: z.literal("projectOpened"),
    root: z.string().min(1),
    manifest: manifestSchema,
  }),
  z.object({
    kind: z.literal("transactionApplied"),
    transaction: appliedTransactionSchema,
  }),
  z.object({
    kind: z.literal("historyChanged"),
    canUndo: z.boolean(),
    canRedo: z.boolean(),
  }),
  z.object({
    kind: z.literal("diagnostics"),
    items: z.array(diagnosticItemSchema),
  }),
  z.object({
    kind: z.literal("commandFailed"),
    message: z.string().min(1),
  }),
]);
export type DocToShell = z.infer<typeof docToShellSchema>;

export interface TokenItem {
  name: string;
  value: string;
  values: Record<string, string>;
  file: string;
  span: { start: number; end: number };
}

export interface TokenModeItem {
  name: string;
  isDefault: boolean;
}

export interface SharedStyleRuleItem {
  file: string;
  selector: string;
  fullSelector: string;
  decls: Array<{
    prop: string;
    value: string;
    propSpan: { start: number; end: number };
    valueSpan: { start: number; end: number };
  }>;
}

export interface ComponentSummaryItem {
  name: string;
  file: string;
  frameName: string;
  axes: VariantAxis[];
}

export * from "./export";

export const commentAnchorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("node"),
    nodeRef: nodeRefSchema,
    x: z.number().optional(),
    y: z.number().optional(),
    pageId: z.string().optional(),
  }),
  z.object({
    type: z.literal("canvas"),
    pageId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
]);
export type CommentAnchor = z.infer<typeof commentAnchorSchema>;

export const commentMessageSchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type CommentMessage = z.infer<typeof commentMessageSchema>;

export const commentThreadSchema = z.object({
  id: z.string(),
  anchor: commentAnchorSchema,
  messages: z.array(commentMessageSchema),
  resolved: z.boolean().default(false),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CommentThread = z.infer<typeof commentThreadSchema>;

export const commentsDocSchema = z.object({
  version: z.literal(1),
  threads: z.array(commentThreadSchema),
});
export type CommentsDoc = z.infer<typeof commentsDocSchema>;

export const gitCommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  email: z.string(),
  date: z.string(),
  message: z.string(),
  changedPages: z.array(z.string()),
  changedFiles: z.array(z.string()),
});
export type GitCommit = z.infer<typeof gitCommitSchema>;

export const gitBranchListSchema = z.object({
  current: z.string().nullable(),
  branches: z.array(z.string()),
});
export type GitBranchList = z.infer<typeof gitBranchListSchema>;

export const gitStatusSchema = z.object({
  isRepo: z.boolean(),
  currentBranch: z.string().nullable(),
  dirty: z.boolean(),
  changedFiles: z.array(z.string()),
});
export type GitStatus = z.infer<typeof gitStatusSchema>;
