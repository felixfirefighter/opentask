import { z } from "zod";

import { isDatabaseSafeTaskText } from "../../domain/task-text";
import { assertValidRank } from "../ranking";

export const entityIdSchema = z.uuidv4().transform((value) => value.toLowerCase());
export const idempotencyKeyHeaderSchema = entityIdSchema;
export const VERSION_MAX = 2_147_483_647;
export const versionSchema = z.number().int().positive().max(VERSION_MAX);
export const isoTimestampSchema = z.iso.datetime({ offset: true });
export const serverRankSchema = z.string().min(1).max(128).refine(isValidServerRank, "The rank is invalid.");
export const opaqueCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

export const databaseSafeTextSchema = z
  .string()
  .refine(isDatabaseSafeTaskText, "Text contains a character that cannot be stored safely.");
export const organizerNameSchema = unicodeBoundedString(120, true);
export const tagNameSchema = unicodeBoundedString(120, true);
export const taskTitleSchema = unicodeBoundedString(500, true);
export const checklistTitleSchema = unicodeBoundedString(500, true);
export const taskDescriptionSchema = unicodeBoundedString(20_000, false);

export const colorTokenSchema = z.enum(["coral", "amber", "mint", "sky", "violet", "slate"]);
export const taskPrioritySchema = z.enum(["none", "low", "medium", "high"]);
export const taskStatusSchema = z.enum(["open", "completed", "cancelled"]);

export const placementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("start") }),
  z.strictObject({ kind: z.literal("end") }),
  z.strictObject({ kind: z.literal("before"), anchorId: entityIdSchema }),
  z.strictObject({ kind: z.literal("after"), anchorId: entityIdSchema }),
]);

export const expectedVersionRequestSchema = z.strictObject({ expectedVersion: versionSchema });
export const versionedResourceReferenceSchema = z.strictObject({
  id: entityIdSchema,
  version: versionSchema,
});

export const collectionQuerySchema = z.strictObject({
  cursor: opaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const versionedResourceSchema = z.strictObject({
  id: entityIdSchema,
  version: versionSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const softDeletableResourceSchema = versionedResourceSchema.extend({
  deletedAt: isoTimestampSchema.nullable(),
});

export type CollectionQuery = z.infer<typeof collectionQuerySchema>;
export type ColorToken = z.infer<typeof colorTokenSchema>;
export type EntityId = z.infer<typeof entityIdSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;

function unicodeBoundedString(maximum: number, trim: boolean) {
  const base = trim ? databaseSafeTextSchema.trim().min(1) : databaseSafeTextSchema;
  return base.refine((value) => Array.from(value).length <= maximum, {
    message: `Must contain at most ${maximum} Unicode characters.`,
  });
}

function isValidServerRank(value: string): boolean {
  try {
    assertValidRank(value);
    return true;
  } catch {
    return false;
  }
}
