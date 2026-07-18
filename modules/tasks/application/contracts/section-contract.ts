import { z } from "zod";

import {
  collectionQuerySchema,
  entityIdSchema,
  expectedVersionRequestSchema,
  opaqueCursorSchema,
  organizerNameSchema,
  placementSchema,
  serverRankSchema,
  versionedResourceSchema,
  versionSchema,
} from "./contract-primitives";

export const sectionDtoSchema = versionedResourceSchema.extend({
  listId: entityIdSchema,
  name: organizerNameSchema,
  rank: serverRankSchema,
});

export const sectionPageSchema = z.strictObject({
  items: z.array(sectionDtoSchema),
  nextCursor: opaqueCursorSchema.nullable(),
});

export const sectionQuerySchema = collectionQuerySchema;

export const createSectionRequestSchema = z.strictObject({
  name: organizerNameSchema,
  placement: placementSchema.optional().default({ kind: "end" }),
});

const sectionPatchSchema = z
  .strictObject({ name: organizerNameSchema.optional() })
  .refine((patch) => Object.keys(patch).length > 0, "At least one section field must change.");

export const updateSectionRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  patch: sectionPatchSchema,
});

export const positionSectionRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  placement: placementSchema,
});

export const deleteSectionRequestSchema = expectedVersionRequestSchema;

export type CreateSectionRequest = z.infer<typeof createSectionRequestSchema>;
export type PositionSectionRequest = z.infer<typeof positionSectionRequestSchema>;
export type SectionDto = z.infer<typeof sectionDtoSchema>;
export type SectionPage = z.infer<typeof sectionPageSchema>;
export type SectionQuery = z.infer<typeof sectionQuerySchema>;
export type UpdateSectionRequest = z.infer<typeof updateSectionRequestSchema>;
