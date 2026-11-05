import {
  declarationSchema,
  nodeSpecSchema,
  tokenModeNameSchema,
  variantAxisSchema,
} from "@ombrique/protocol";
import { z } from "zod";

export const handleRefSchema = z.object({
  handle: z.string().min(1),
});
export type HandleRef = z.infer<typeof handleRefSchema>;

export const handleEditCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("setStyle"),
    target: handleRefSchema,
    declarations: z.array(declarationSchema).min(1),
  }),
  z.object({
    kind: z.literal("setText"),
    target: handleRefSchema,
    text: z.string(),
  }),
  z.object({
    kind: z.literal("setAttrs"),
    target: handleRefSchema,
    attrs: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  }),
  z.object({
    kind: z.literal("createNodes"),
    parent: handleRefSchema.nullable(),
    pageFile: z.string().min(1),
    index: z.number().int().nonnegative(),
    specs: z.array(nodeSpecSchema).min(1),
  }),
  z.object({
    kind: z.literal("deleteNodes"),
    targets: z.array(handleRefSchema).min(1),
  }),
  z.object({
    kind: z.literal("duplicateNode"),
    target: handleRefSchema,
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({
    kind: z.literal("reparent"),
    target: handleRefSchema,
    parent: handleRefSchema.nullable(),
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
    targets: z.array(handleRefSchema).min(1),
    parent: handleRefSchema.nullable(),
    pageFile: z.string().min(1),
    index: z.number().int().nonnegative(),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("ungroupNode"),
    target: handleRefSchema,
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
    target: handleRefSchema,
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("detachInstance"),
    target: handleRefSchema,
  }),
  z.object({
    kind: z.literal("flattenBoolean"),
    target: handleRefSchema,
  }),
  z.object({
    kind: z.literal("createVariantSet"),
    targets: z.array(handleRefSchema).min(2),
    name: z.string().min(1),
    axes: z.array(variantAxisSchema).min(1),
  }),
]);
export type HandleEditCommand = z.infer<typeof handleEditCommandSchema>;
