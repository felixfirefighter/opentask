import { z } from "zod";

export const companionLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const companionActionTypeSchema = z.enum([
  "task_completed",
  "planner_applied",
  "daily_checkin",
  "focus_completed",
]);
export const companionPreferencePatchSchema = z
  .object({
    proactiveMessages: z.enum(["enabled", "muted"]).optional(),
    communicationStyle: z.enum(["warm", "focused", "direct"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one companion preference must change.");
export const companionPreferenceRequestSchema = z
  .object({ expectedVersion: z.number().int().positive(), patch: companionPreferencePatchSchema })
  .strict();
export const companionChatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(1_000),
    selectedTaskIds: z.array(z.string().uuid()).max(3).default([]),
    mode: z.enum(["warm", "focused", "direct"]).optional(),
  })
  .strict();
export const companionSummarySchema = z
  .object({
    completionCount: z.number().int().nonnegative(),
    xpEarned: z.number().int().nonnegative(),
    strongestDay: z.string().nullable(),
    message: z.string().min(1).max(280),
  })
  .strict();
export const companionMemoryRequestSchema = z.object({ text: z.string().trim().min(1).max(500) }).strict();
export const companionDailyModeRequestSchema = z
  .object({ mode: z.enum(["warm", "focused", "direct"]) })
  .strict();

export type CompanionActionType = z.infer<typeof companionActionTypeSchema>;
export type CompanionPreferencePatch = z.infer<typeof companionPreferencePatchSchema>;
export type CompanionChatRequest = z.infer<typeof companionChatRequestSchema>;
