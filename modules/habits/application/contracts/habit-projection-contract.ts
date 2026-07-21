import { z } from "zod";
import { Temporal } from "temporal-polyfill";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";
import { CANONICAL_IANA_TIME_ZONES } from "@/shared/validation/canonical-time-zones";

import { HABIT_HISTORY_MAX_DAYS } from "../../domain/habit-history-policy";
import { habitDetailDtoSchema } from "./habit-contract";
import {
  HABIT_PAGE_MAX_ITEMS,
  habitIdSchema,
  habitLocalDateSchema,
  habitOpaqueCursorSchema,
} from "./habit-contract-primitives";
import { habitLogDtoSchema } from "./habit-log-contract";

export const habitDayStatusSchema = z.enum([
  "not_scheduled",
  "outside_range",
  "future",
  "open",
  "partial",
  "successful",
  "skipped",
  "unachieved",
]);

export const habitDayProjectionSchema = z.strictObject({
  localDate: habitLocalDateSchema,
  scheduled: z.boolean(),
  status: habitDayStatusSchema,
  successful: z.boolean(),
  log: habitLogDtoSchema.nullable(),
});

export const habitStreakProjectionSchema = z.strictObject({
  habitId: habitIdSchema,
  cadence: z.enum(["day", "week"]),
  current: z.number().int().nonnegative(),
  best: z.number().int().nonnegative(),
  evaluatedThrough: habitLocalDateSchema,
});

export const habitWeeklyProgressSchema = z.strictObject({
  completedDays: z.number().int().min(0).max(7),
  targetPerWeek: z.number().int().min(1).max(7),
  achieved: z.boolean(),
  open: z.boolean(),
});

export const habitTodayRowSchema = z.strictObject({
  detail: habitDetailDtoSchema,
  localDate: habitLocalDateSchema,
  day: habitDayProjectionSchema,
  streak: habitStreakProjectionSchema,
  sevenDay: z.array(habitDayProjectionSchema).length(7),
  weeklyProgress: habitWeeklyProgressSchema.nullable(),
  requiresAction: z.boolean(),
});

export const habitTodayBoundarySchema = z.strictObject({
  timezone: ianaTimeZoneSchema,
  localDate: habitLocalDateSchema,
});

const habitTodayBoundariesSchema = z
  .array(habitTodayBoundarySchema)
  .max(CANONICAL_IANA_TIME_ZONES.length)
  .superRefine((boundaries, context) => {
    for (let index = 1; index < boundaries.length; index += 1) {
      const previous = boundaries[index - 1];
      const current = boundaries[index];
      if (previous && current && compareTodayBoundaries(previous, current) >= 0) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Habit Today boundaries must be unique and sorted by timezone then local date.",
        });
      }
    }
  });

export const habitTodayProjectionSchema = z.strictObject({
  rows: z.array(habitTodayRowSchema).max(HABIT_PAGE_MAX_ITEMS),
  boundaries: habitTodayBoundariesSchema,
  nextCursor: habitOpaqueCursorSchema.nullable(),
});

export const habitHistoryQuerySchema = z
  .strictObject({
    startDate: habitLocalDateSchema,
    endDate: habitLocalDateSchema,
  })
  .superRefine((range, context) => {
    const span = Temporal.PlainDate.from(range.startDate).until(Temporal.PlainDate.from(range.endDate)).days;
    if (span < 0) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "History must end on or after it starts.",
      });
    } else if (span + 1 > HABIT_HISTORY_MAX_DAYS) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `History cannot exceed ${HABIT_HISTORY_MAX_DAYS} local days.`,
      });
    }
  });

export const habitHistoryProjectionSchema = z.strictObject({
  habitId: habitIdSchema,
  startDate: habitLocalDateSchema,
  endDate: habitLocalDateSchema,
  days: z.array(habitDayProjectionSchema),
});

const habitYearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => value >= "0001-01" && value <= "9999-12", "Month is outside the supported range.");

export const habitMonthQuerySchema = z.strictObject({ yearMonth: habitYearMonthSchema });

export const habitMonthProjectionSchema = z.strictObject({
  habitId: habitIdSchema,
  yearMonth: habitYearMonthSchema,
  days: z.array(habitDayProjectionSchema).min(28).max(31),
});

export const habitOverviewSchema = z.strictObject({
  detail: habitDetailDtoSchema,
  localDate: habitLocalDateSchema,
  today: habitDayProjectionSchema,
  streak: habitStreakProjectionSchema,
  sevenDay: z.array(habitDayProjectionSchema).length(7),
  weeklyProgress: habitWeeklyProgressSchema.nullable(),
});

export const habitOverviewPageSchema = z.strictObject({
  items: z.array(habitOverviewSchema).max(HABIT_PAGE_MAX_ITEMS),
  nextCursor: habitOpaqueCursorSchema.nullable(),
});

export type HabitDayProjection = z.infer<typeof habitDayProjectionSchema>;
export type HabitHistoryProjection = z.infer<typeof habitHistoryProjectionSchema>;
export type HabitHistoryQuery = z.infer<typeof habitHistoryQuerySchema>;
export type HabitMonthProjection = z.infer<typeof habitMonthProjectionSchema>;
export type HabitMonthQuery = z.infer<typeof habitMonthQuerySchema>;
export type HabitOverview = z.infer<typeof habitOverviewSchema>;
export type HabitOverviewPage = z.infer<typeof habitOverviewPageSchema>;
export type HabitStreakProjection = z.infer<typeof habitStreakProjectionSchema>;
export type HabitTodayBoundary = z.infer<typeof habitTodayBoundarySchema>;
export type HabitTodayProjection = z.infer<typeof habitTodayProjectionSchema>;
export type HabitTodayRow = z.infer<typeof habitTodayRowSchema>;

function compareTodayBoundaries(
  left: Pick<HabitTodayBoundary, "timezone" | "localDate">,
  right: Pick<HabitTodayBoundary, "timezone" | "localDate">,
): number {
  if (left.timezone !== right.timezone) return left.timezone < right.timezone ? -1 : 1;
  if (left.localDate === right.localDate) return 0;
  return left.localDate < right.localDate ? -1 : 1;
}
