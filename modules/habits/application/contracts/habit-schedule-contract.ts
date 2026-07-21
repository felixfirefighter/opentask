import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import { normalizeHabitSchedule, type HabitSchedule } from "../../domain/habit-schedule-policy";
import {
  habitExpectedVersionSchema,
  habitIdSchema,
  habitInstantSchema,
  habitLocalDateSchema,
} from "./habit-contract-primitives";

export const habitIsoWeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const selectedWeekdaysSchema = z.array(habitIsoWeekdaySchema).min(1).max(7);
const common = {
  timezone: ianaTimeZoneSchema,
  startDate: habitLocalDateSchema,
  endDate: habitLocalDateSchema.nullable().optional().default(null),
};

export const habitScheduleValueSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("daily"),
      weekdays: z.null().optional().default(null),
      targetPerWeek: z.null().optional().default(null),
      ...common,
    }),
    z.strictObject({
      kind: z.literal("weekdays"),
      weekdays: selectedWeekdaysSchema,
      targetPerWeek: z.null().optional().default(null),
      ...common,
    }),
    z.strictObject({
      kind: z.literal("weekly_target"),
      weekdays: z.null().optional().default(null),
      targetPerWeek: z.number().int().min(1).max(7),
      ...common,
    }),
  ])
  .transform((value, context) => {
    try {
      return normalizeHabitSchedule(value as HabitSchedule);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "The habit schedule is invalid.",
      });
      return z.NEVER;
    }
  });

export const habitScheduleDtoSchema = z.strictObject({
  habitId: habitIdSchema,
  schedule: habitScheduleValueSchema,
  createdAt: habitInstantSchema,
  updatedAt: habitInstantSchema,
});

export const setHabitScheduleRequestSchema = habitExpectedVersionSchema.extend({
  schedule: habitScheduleValueSchema,
});

export type HabitScheduleDto = z.infer<typeof habitScheduleDtoSchema>;
export type HabitScheduleValue = z.infer<typeof habitScheduleValueSchema>;
export type SetHabitScheduleRequest = z.infer<typeof setHabitScheduleRequestSchema>;
