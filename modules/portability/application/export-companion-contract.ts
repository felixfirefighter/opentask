import { z } from "zod";

import { companionSummarySchema } from "@/modules/companion";

import {
  PORTABLE_SECTION_SCHEMA_VERSION,
  portableDateSchema,
  portableIdSchema,
  portableInstantSchema,
  portableVersionSchema,
} from "./export-contract-primitives";

const profileSchema = z.strictObject({
  totalXp: z.number().int().nonnegative(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  proactiveMessages: z.enum(["enabled", "muted"]),
  communicationStyle: z.enum(["warm", "focused", "direct"]),
  dailyMode: z.enum(["warm", "focused", "direct"]).nullable(),
  dailyModeDate: portableDateSchema.nullable(),
  lastDailyPromptDate: portableDateSchema.nullable(),
  schemaVersion: z.literal(1),
  version: portableVersionSchema,
  createdAt: portableInstantSchema,
  updatedAt: portableInstantSchema,
});

export const portableCompanionSectionSchema = z.strictObject({
  schemaVersion: z.literal(PORTABLE_SECTION_SCHEMA_VERSION),
  profile: profileSchema.nullable(),
  xpEvents: z.array(
    z.strictObject({
      id: portableIdSchema,
      actionType: z.enum(["task_completed", "planner_applied", "daily_checkin", "focus_completed"]),
      sourceKey: z.string().min(1).max(180),
      xp: z.number().int().positive().max(25),
      localDate: portableDateSchema,
      createdAt: portableInstantSchema,
    }),
  ),
  summary: z
    .strictObject({
      schemaVersion: z.literal(1),
      summary: companionSummarySchema,
      windowStartedOn: portableDateSchema,
      windowEndedOn: portableDateSchema,
      generatedAt: portableInstantSchema,
    })
    .nullable(),
  memories: z.array(
    z.strictObject({
      id: portableIdSchema,
      text: z.string().min(1).max(500),
      createdAt: portableInstantSchema,
    }),
  ),
});
