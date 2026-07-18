import { z } from "zod";

import {
  collectionQuerySchema,
  colorTokenSchema,
  entityIdSchema,
  expectedVersionRequestSchema,
  opaqueCursorSchema,
  softDeletableResourceSchema,
  tagNameSchema,
  versionSchema,
  versionedResourceReferenceSchema,
} from "./contract-primitives";

export const tagDtoSchema = softDeletableResourceSchema.extend({
  name: tagNameSchema,
  colorToken: colorTokenSchema,
});

export const tagPageSchema = z.strictObject({
  items: z.array(tagDtoSchema),
  nextCursor: opaqueCursorSchema.nullable(),
});

export const tagQuerySchema = collectionQuerySchema;

export const createTagRequestSchema = z.strictObject({
  name: tagNameSchema,
  colorToken: colorTokenSchema,
});

const tagPatchSchema = z
  .strictObject({
    name: tagNameSchema.optional(),
    colorToken: colorTokenSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "At least one tag field must change.");

export const updateTagRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  patch: tagPatchSchema,
});

export const deleteTagRequestSchema = expectedVersionRequestSchema;
export const restoreTagRequestSchema = expectedVersionRequestSchema;

export const replaceTaskTagsRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  tagIds: z
    .array(entityIdSchema)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Tag IDs must be unique."),
});

export const replaceTaskTagsOutputSchema = z.strictObject({
  task: versionedResourceReferenceSchema,
  tags: z.array(tagDtoSchema),
});

export type CreateTagRequest = z.infer<typeof createTagRequestSchema>;
export type ReplaceTaskTagsRequest = z.infer<typeof replaceTaskTagsRequestSchema>;
export type ReplaceTaskTagsOutput = z.infer<typeof replaceTaskTagsOutputSchema>;
export type TagDto = z.infer<typeof tagDtoSchema>;
export type TagPage = z.infer<typeof tagPageSchema>;
export type TagQuery = z.infer<typeof tagQuerySchema>;
export type UpdateTagRequest = z.infer<typeof updateTagRequestSchema>;
