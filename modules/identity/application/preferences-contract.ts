import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

export const preferenceDocumentSchema = z
  .object({
    timezone: ianaTimeZoneSchema,
    weekStart: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    hourCycle: z.enum(["h12", "h23"]),
    theme: z.enum(["light", "dark", "system"]),
    reducedMotion: z.boolean(),
  })
  .strict();

export const userPreferencesPatchSchema = preferenceDocumentSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "At least one preference must change.");

export const updateUserPreferencesRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    patch: userPreferencesPatchSchema,
  })
  .strict();

export const preferenceSchemaVersion = 1 as const;

export const userPreferencesSchema = preferenceDocumentSchema
  .extend({
    schemaVersion: z.literal(preferenceSchemaVersion),
    version: z.number().int().positive(),
  })
  .strict();

export const defaultPreferenceDocument: PreferenceDocument = {
  timezone: "UTC",
  weekStart: 1,
  hourCycle: "h12",
  theme: "system",
  reducedMotion: false,
};

export type PreferenceDocument = z.infer<typeof preferenceDocumentSchema>;
export type UserPreferencesPatch = z.infer<typeof userPreferencesPatchSchema>;

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
