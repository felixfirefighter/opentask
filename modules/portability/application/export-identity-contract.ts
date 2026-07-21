import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  PORTABLE_SECTION_SCHEMA_VERSION,
  boundedUnicode,
  portableIdSchema,
  portableInstantSchema,
  portableVersionSchema,
} from "./export-contract-primitives";

export const portableIdentitySectionSchema = z.strictObject({
  schemaVersion: z.literal(PORTABLE_SECTION_SCHEMA_VERSION),
  profile: z.strictObject({
    id: portableIdSchema,
    name: boundedUnicode(500),
    email: z.email().max(320),
    createdAt: portableInstantSchema,
    updatedAt: portableInstantSchema,
  }),
  preferences: z.strictObject({
    schemaVersion: z.literal(2),
    version: portableVersionSchema,
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
    onboarding: z.strictObject({
      complete: z.boolean(),
      completedAt: z.string().datetime({ offset: true }).nullable(),
      goals: z.array(z.string()).max(7),
      checkins: z
        .array(
          z.strictObject({
            date: z.iso.date(),
            mood: z.enum(["good", "tired", "heavy", "ready"]),
            note: z.string().max(500).optional(),
          }),
        )
        .max(30),
    }),
    createdAt: portableInstantSchema,
    updatedAt: portableInstantSchema,
  }),
});

export type PortableIdentitySection = z.infer<typeof portableIdentitySectionSchema>;
