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
    schemaVersion: z.literal(1),
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
    createdAt: portableInstantSchema,
    updatedAt: portableInstantSchema,
  }),
});

export type PortableIdentitySection = z.infer<typeof portableIdentitySectionSchema>;
