import { z } from "zod";

import {
  checklistTitleSchema,
  entityIdSchema,
  expectedVersionRequestSchema,
  placementSchema,
  serverRankSchema,
  versionedResourceSchema,
  versionSchema,
} from "./contract-primitives";

export const checklistItemDtoSchema = versionedResourceSchema.extend({
  taskId: entityIdSchema,
  title: checklistTitleSchema,
  isCompleted: z.boolean(),
  rank: serverRankSchema,
});

export const createChecklistItemRequestSchema = z.strictObject({
  title: checklistTitleSchema,
  placement: placementSchema.optional().default({ kind: "end" }),
});

const checklistItemPatchSchema = z
  .strictObject({
    title: checklistTitleSchema.optional(),
    isCompleted: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "At least one checklist field must change.");

export const updateChecklistItemRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  patch: checklistItemPatchSchema,
});

export const positionChecklistItemRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  placement: placementSchema,
});

export const deleteChecklistItemRequestSchema = expectedVersionRequestSchema;

export type ChecklistItemDto = z.infer<typeof checklistItemDtoSchema>;
export type CreateChecklistItemRequest = z.infer<typeof createChecklistItemRequestSchema>;
export type PositionChecklistItemRequest = z.infer<typeof positionChecklistItemRequestSchema>;
export type UpdateChecklistItemRequest = z.infer<typeof updateChecklistItemRequestSchema>;
