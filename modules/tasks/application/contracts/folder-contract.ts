import { z } from "zod";

import {
  collectionQuerySchema,
  expectedVersionRequestSchema,
  organizerNameSchema,
  placementSchema,
  opaqueCursorSchema,
  serverRankSchema,
  softDeletableResourceSchema,
  versionSchema,
} from "./contract-primitives";

export const folderDtoSchema = softDeletableResourceSchema.extend({
  name: organizerNameSchema,
  rank: serverRankSchema,
});

export const folderPageSchema = z.strictObject({
  items: z.array(folderDtoSchema),
  nextCursor: opaqueCursorSchema.nullable(),
});

export const folderQuerySchema = collectionQuerySchema;

export const createFolderRequestSchema = z.strictObject({
  name: organizerNameSchema,
  placement: placementSchema.optional().default({ kind: "end" }),
});

const folderPatchSchema = z
  .strictObject({ name: organizerNameSchema.optional() })
  .refine((patch) => Object.keys(patch).length > 0, "At least one folder field must change.");

export const updateFolderRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  patch: folderPatchSchema,
});

export const positionFolderRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  placement: placementSchema,
});

export const deleteFolderRequestSchema = expectedVersionRequestSchema;
export const restoreFolderRequestSchema = expectedVersionRequestSchema;

export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;
export type FolderDto = z.infer<typeof folderDtoSchema>;
export type FolderPage = z.infer<typeof folderPageSchema>;
export type FolderQuery = z.infer<typeof folderQuerySchema>;
export type PositionFolderRequest = z.infer<typeof positionFolderRequestSchema>;
export type UpdateFolderRequest = z.infer<typeof updateFolderRequestSchema>;
