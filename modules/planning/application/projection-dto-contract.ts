import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import { compareInstants, compareLocalDates } from "../domain/projections/local-time-policy";

const entityIdSchema = z.uuidv4();
const titleSchema = unicodeBoundedString(500);
const rankSchema = z.string().min(1).max(128);
const versionSchema = z.number().int().positive().max(2_147_483_647);
const prioritySchema = z.enum(["none", "low", "medium", "high"]);
const localDateSchema = z.iso.date();
const instantSchema = z.iso.datetime({ offset: true });

const allDayProjectionScheduleSchema = z
  .strictObject({
    kind: z.literal("all_day"),
    startDate: localDateSchema,
    endDate: localDateSchema,
  })
  .refine((schedule) => compareLocalDates(schedule.endDate, schedule.startDate) > 0, {
    message: "An all-day schedule must end after it starts.",
  });

const timedProjectionScheduleSchema = z
  .strictObject({
    kind: z.literal("timed"),
    startAt: instantSchema,
    endAt: instantSchema,
    timezone: ianaTimeZoneSchema,
  })
  .refine((schedule) => compareInstants(schedule.endAt, schedule.startAt) >= 0, {
    message: "A timed schedule cannot end before it starts.",
  });

export const projectionScheduleSchema = z.discriminatedUnion("kind", [
  allDayProjectionScheduleSchema,
  timedProjectionScheduleSchema,
]);

const planningTaskFields = {
  id: entityIdSchema,
  listId: entityIdSchema,
  title: titleSchema,
  status: z.literal("open"),
  priority: prioritySchema,
  rank: rankSchema,
  version: versionSchema,
} as const;

export const planningTaskRowSchema = z.strictObject({
  ...planningTaskFields,
  schedule: projectionScheduleSchema.nullable(),
});

const scheduledPlanningTaskRowSchema = planningTaskRowSchema.extend({
  schedule: projectionScheduleSchema,
});

export const todayProjectionSchema = z.strictObject({
  localDate: localDateSchema,
  timeZone: ianaTimeZoneSchema,
  nowAt: instantSchema,
  overdue: z.array(scheduledPlanningTaskRowSchema).max(500),
  timed: z.array(scheduledPlanningTaskRowSchema.extend({ schedule: timedProjectionScheduleSchema })).max(500),
  anytime: z
    .array(scheduledPlanningTaskRowSchema.extend({ schedule: allDayProjectionScheduleSchema }))
    .max(500),
  remainingCount: z.number().int().nonnegative().max(500),
  truncated: z.boolean(),
});

export const upcomingDaySchema = z.strictObject({
  localDate: localDateSchema,
  items: z.array(scheduledPlanningTaskRowSchema).max(500),
});

export const upcomingProjectionSchema = z.strictObject({
  rangeStartDate: localDateSchema,
  rangeEndDate: localDateSchema,
  timeZone: ianaTimeZoneSchema,
  nowAt: instantSchema,
  days: z.array(upcomingDaySchema).length(7),
  remainingCount: z.number().int().nonnegative().max(500),
  truncated: z.boolean(),
});

const calendarEventFields = {
  taskId: entityIdSchema,
  listId: entityIdSchema,
  title: titleSchema,
  status: z.literal("open"),
  priority: prioritySchema,
  version: versionSchema,
} as const;

const allDayCalendarEventSchema = z.strictObject({
  ...calendarEventFields,
  kind: z.literal("all_day"),
  startDate: localDateSchema,
  endDate: localDateSchema,
});

const timedCalendarEventSchema = z.strictObject({
  ...calendarEventFields,
  kind: z.literal("timed"),
  startAt: instantSchema,
  endAt: instantSchema,
  timezone: ianaTimeZoneSchema,
});

export const calendarEventDtoSchema = z.discriminatedUnion("kind", [
  allDayCalendarEventSchema,
  timedCalendarEventSchema,
]);

export const calendarProjectionSchema = z.strictObject({
  rangeStartDate: localDateSchema,
  rangeEndDate: localDateSchema,
  rangeStartAt: instantSchema,
  rangeEndAt: instantSchema,
  timeZone: ianaTimeZoneSchema,
  events: z.array(calendarEventDtoSchema).max(500),
  truncated: z.boolean(),
});

export const agendaRowSchema = z.strictObject({
  groupDate: localDateSchema,
  event: calendarEventDtoSchema,
});

export const agendaProjectionSchema = z.strictObject({
  rangeStartDate: localDateSchema,
  rangeEndDate: localDateSchema,
  rangeStartAt: instantSchema,
  rangeEndAt: instantSchema,
  timeZone: ianaTimeZoneSchema,
  items: z.array(agendaRowSchema).max(500),
  truncated: z.boolean(),
});

export const eisenhowerProjectionSchema = z
  .strictObject({
    timeZone: ianaTimeZoneSchema,
    nowAt: instantSchema,
    urgentThroughAt: instantSchema,
    doNow: z.array(planningTaskRowSchema).max(500),
    plan: z.array(planningTaskRowSchema).max(500),
    timeSensitive: z.array(planningTaskRowSchema).max(500),
    later: z.array(planningTaskRowSchema).max(500),
    truncated: z.boolean(),
  })
  .superRefine((projection, context) => {
    const rows = [...projection.doNow, ...projection.plan, ...projection.timeSensitive, ...projection.later];
    if (rows.length > 500) {
      context.addIssue({ code: "custom", message: "A Matrix projection cannot exceed 500 tasks." });
    }
    if (new Set(rows.map((row) => row.id)).size !== rows.length) {
      context.addIssue({ code: "custom", message: "A task can appear in only one Matrix quadrant." });
    }
  });

export type AgendaProjection = z.infer<typeof agendaProjectionSchema>;
export type AgendaRow = z.infer<typeof agendaRowSchema>;
export type CalendarEventDto = z.infer<typeof calendarEventDtoSchema>;
export type CalendarProjection = z.infer<typeof calendarProjectionSchema>;
export type EisenhowerProjection = z.infer<typeof eisenhowerProjectionSchema>;
export type PlanningTaskRow = z.infer<typeof planningTaskRowSchema>;
export type TodayProjection = z.infer<typeof todayProjectionSchema>;
export type UpcomingProjection = z.infer<typeof upcomingProjectionSchema>;

function unicodeBoundedString(maximum: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= maximum, {
      message: `Must contain at most ${maximum} Unicode characters.`,
    });
}
