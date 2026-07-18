import { z } from "zod";

import {
  collectionQuerySchema,
  colorTokenSchema,
  entityIdSchema,
  expectedVersionRequestSchema,
  opaqueCursorSchema,
  organizerNameSchema,
  placementSchema,
  serverRankSchema,
  softDeletableResourceSchema,
  versionSchema,
} from "./contract-primitives";

export const regularListDtoSchema = softDeletableResourceSchema.extend({
  folderId: entityIdSchema.nullable(),
  name: organizerNameSchema,
  colorToken: colorTokenSchema,
  rank: serverRankSchema,
  kind: z.literal("regular"),
});

export const regularListPageSchema = z.strictObject({
  items: z.array(regularListDtoSchema),
  nextCursor: opaqueCursorSchema.nullable(),
});

export const regularListQuerySchema = collectionQuerySchema;

export const createRegularListRequestSchema = z.strictObject({
  name: organizerNameSchema,
  colorToken: colorTokenSchema,
  folderId: entityIdSchema.nullable().optional().default(null),
  placement: placementSchema.optional().default({ kind: "end" }),
});

const regularListPatchSchema = z
  .strictObject({
    name: organizerNameSchema.optional(),
    colorToken: colorTokenSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "At least one list field must change.");

export const updateRegularListRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  patch: regularListPatchSchema,
});

export const moveRegularListRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  folderId: entityIdSchema.nullable(),
  placement: placementSchema,
});

export const deleteRegularListRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  moveTasksToListId: entityIdSchema.optional(),
});

export const restoreRegularListRequestSchema = expectedVersionRequestSchema;

export type CreateRegularListRequest = z.infer<typeof createRegularListRequestSchema>;
export type DeleteRegularListRequest = z.infer<typeof deleteRegularListRequestSchema>;
export type MoveRegularListRequest = z.infer<typeof moveRegularListRequestSchema>;
export type RegularListDto = z.infer<typeof regularListDtoSchema>;
export type RegularListPage = z.infer<typeof regularListPageSchema>;
export type RegularListQuery = z.infer<typeof regularListQuerySchema>;
export type UpdateRegularListRequest = z.infer<typeof updateRegularListRequestSchema>;
