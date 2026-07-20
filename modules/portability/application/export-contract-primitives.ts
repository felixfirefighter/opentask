import { z } from "zod";

export const PORTABLE_SECTION_SCHEMA_VERSION = 1 as const;
export const PORTABLE_TASKS_SECTION_SCHEMA_VERSION = 2 as const;
export const USER_EXPORT_SCHEMA_VERSION = 2 as const;

export const portableIdSchema = z.uuidv4();
export const portableInstantSchema = z.iso.datetime();
export const portableDateSchema = z.iso.date();
export const portableVersionSchema = z.number().int().positive().max(2_147_483_647);
export const portableRankSchema = z.string().min(1).max(128);
export const portableOccurrenceKeySchema = z
  .string()
  .min(5)
  .max(80)
  .regex(/^o1\.[A-Za-z0-9_-]+$/, "Must be an opaque version-1 occurrence key.")
  .refine((value) => (value.length - 3) % 4 !== 1, "Must contain a structurally valid base64url payload.");
export const portableColorTokenSchema = z.enum(["coral", "amber", "mint", "sky", "violet", "slate"]);
export const portablePrioritySchema = z.enum(["none", "low", "medium", "high"]);

export const versionedFields = {
  version: portableVersionSchema,
  createdAt: portableInstantSchema,
  updatedAt: portableInstantSchema,
} as const;

export const softDeleteFields = {
  deletedAt: portableInstantSchema.nullable(),
} as const;

export function boundedUnicode(maximum: number) {
  return z.string().refine((value) => Array.from(value).length <= maximum, {
    message: `Must contain at most ${maximum} Unicode characters.`,
  });
}
