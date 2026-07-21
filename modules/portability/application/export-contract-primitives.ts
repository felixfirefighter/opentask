import { z } from "zod";

export const PORTABLE_SECTION_SCHEMA_VERSION = 1 as const;
export const PORTABLE_TASKS_SECTION_SCHEMA_VERSION = 2 as const;
export const PORTABLE_HABITS_SECTION_SCHEMA_VERSION = 1 as const;
export const PORTABLE_FOCUS_SECTION_SCHEMA_VERSION = 1 as const;
export const USER_EXPORT_SCHEMA_VERSION = 4 as const;

export const portableIdSchema = z.uuidv4();
export const portableInstantSchema = z.iso.datetime();
export const portableDateSchema = z.iso.date();
export const portableVersionSchema = z.number().int().positive().max(2_147_483_647);
export const portableRankSchema = z.string().min(1).max(128);

const portableOccurrenceKeyV1Schema = z
  .string()
  .min(5)
  .max(80)
  .regex(/^o1\.[A-Za-z0-9_-]+$/, "Must be an opaque version-1 occurrence key.")
  .refine((value) => (value.length - 3) % 4 !== 1, "Must contain a structurally valid base64url payload.");

const portableOccurrenceKeyV2Schema = z
  .string()
  .min(39)
  .max(61)
  .regex(
    /^o2\.[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}_(?:0|-?[1-9a-z][0-9a-z]{0,10})_(?:0|-?[1-9a-z][0-9a-z]{0,10})$/,
    "Must be a canonical version-2 occurrence key.",
  )
  .refine(hasCanonicalSafeBase36Parts, "Must contain bounded canonical base36 occurrence values.");

export const portableOccurrenceKeySchema = z.union([
  portableOccurrenceKeyV1Schema,
  portableOccurrenceKeyV2Schema,
]);
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

function hasCanonicalSafeBase36Parts(value: string): boolean {
  const [, instantPart, localPart] = value.split("_");
  return [instantPart, localPart].every((part) => {
    if (part === undefined) return false;
    const parsed = Number.parseInt(part, 36);
    return Number.isSafeInteger(parsed) && parsed.toString(36) === part;
  });
}
