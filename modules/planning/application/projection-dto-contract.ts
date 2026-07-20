import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import { compareInstants, compareLocalDates } from "../domain/projections/local-time-policy";
import { PLANNING_PROJECTION_MAX_ROWS } from "./projection-query-contract";
import {
  RECURRENCE_DRAG_DISABLED_REASON,
  RECURRENCE_MATRIX_EMPTY_SUMMARY,
  unicodeBoundedString,
  validateCalendarEventMetadata,
  validatePlanningTaskMetadata,
  validateUniqueProjectionRows,
} from "./projection-dto-validation";
import {
  oneOffProjectionId,
  recurrenceSummaryProjectionId,
  recurringOccurrenceProjectionId,
} from "./projection-identity";
import {
  planningProjectionTruncationFields,
  validatePlanningProjectionTruncation,
} from "./projection-truncation";

export { RECURRENCE_DRAG_DISABLED_REASON, RECURRENCE_MATRIX_EMPTY_SUMMARY };
export { oneOffProjectionId, recurrenceSummaryProjectionId, recurringOccurrenceProjectionId };

const entityIdSchema = z.uuidv4();
const projectionIdSchema = z.string().min(1).max(160);
const occurrenceKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^o[12]\.[A-Za-z0-9_-]+$/, "The occurrence identity is invalid.");
const titleSchema = unicodeBoundedString(500);
const rankSchema = z.string().min(1).max(128);
const versionSchema = z.number().int().positive().max(2_147_483_647);
const prioritySchema = z.enum(["none", "low", "medium", "high"]);
const localDateSchema = z.iso.date();
const instantSchema = z.iso.datetime({ offset: true });
const occurrenceStateSchema = z.enum(["open", "completed", "skipped"]);
export const projectionLifecycleSchema = z.enum(["one_off", "recurring_occurrence", "recurrence_summary"]);

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

const scheduleInteractionSchema = z.strictObject({
  editScope: z.enum(["task", "series"]),
  dragEnabled: z.boolean(),
  dragDisabledReason: z.string().min(1).nullable(),
});

const planningTaskFields = {
  id: entityIdSchema,
  projectionId: projectionIdSchema,
  projectionLifecycle: projectionLifecycleSchema,
  occurrenceKey: occurrenceKeySchema.nullable(),
  occurrenceState: occurrenceStateSchema.nullable(),
  transitionEligible: z.boolean().nullable(),
  recurrenceSummary: z.string().min(1).max(120).nullable(),
  scheduleInteraction: scheduleInteractionSchema,
  listId: entityIdSchema,
  title: titleSchema,
  status: z.literal("open"),
  priority: prioritySchema,
  rank: rankSchema,
  version: versionSchema,
} as const;

export const planningTaskRowSchema = z
  .strictObject({
    ...planningTaskFields,
    schedule: projectionScheduleSchema.nullable(),
  })
  .superRefine(validatePlanningTaskMetadata);

const scheduledPlanningTaskRowSchema = z
  .strictObject({
    ...planningTaskFields,
    schedule: projectionScheduleSchema,
  })
  .superRefine(validatePlanningTaskMetadata);

const timedPlanningTaskRowSchema = z
  .strictObject({
    ...planningTaskFields,
    schedule: timedProjectionScheduleSchema,
  })
  .superRefine(validatePlanningTaskMetadata);

const allDayPlanningTaskRowSchema = z
  .strictObject({
    ...planningTaskFields,
    schedule: allDayProjectionScheduleSchema,
  })
  .superRefine(validatePlanningTaskMetadata);

export const todayProjectionSchema = z
  .strictObject({
    localDate: localDateSchema,
    timeZone: ianaTimeZoneSchema,
    nowAt: instantSchema,
    overdue: z.array(scheduledPlanningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    timed: z.array(timedPlanningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    anytime: z.array(allDayPlanningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    remainingCount: z.number().int().nonnegative().max(PLANNING_PROJECTION_MAX_ROWS),
    ...planningProjectionTruncationFields,
  })
  .superRefine((projection, context) => {
    validatePlanningProjectionTruncation(projection, context);
    const rows = [...projection.overdue, ...projection.timed, ...projection.anytime];
    validateUniqueProjectionRows(rows, "Today", context);
    if (projection.remainingCount !== rows.length) {
      context.addIssue({ code: "custom", path: ["remainingCount"], message: "Today count is inconsistent." });
    }
  });

export const upcomingDaySchema = z.strictObject({
  localDate: localDateSchema,
  items: z.array(scheduledPlanningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
});

export const upcomingProjectionSchema = z
  .strictObject({
    rangeStartDate: localDateSchema,
    rangeEndDate: localDateSchema,
    timeZone: ianaTimeZoneSchema,
    nowAt: instantSchema,
    days: z.array(upcomingDaySchema).length(7),
    remainingCount: z.number().int().nonnegative().max(PLANNING_PROJECTION_MAX_ROWS),
    ...planningProjectionTruncationFields,
  })
  .superRefine((projection, context) => {
    validatePlanningProjectionTruncation(projection, context);
    const rows = projection.days.flatMap((day) => day.items);
    validateUniqueProjectionRows(rows, "Upcoming", context);
    if (projection.remainingCount !== rows.length) {
      context.addIssue({
        code: "custom",
        path: ["remainingCount"],
        message: "Upcoming count is inconsistent.",
      });
    }
  });

const calendarEventFields = {
  taskId: entityIdSchema,
  projectionId: projectionIdSchema,
  projectionLifecycle: projectionLifecycleSchema,
  occurrenceKey: occurrenceKeySchema.nullable(),
  occurrenceState: occurrenceStateSchema.nullable(),
  transitionEligible: z.boolean().nullable(),
  recurrenceSummary: z.string().min(1).max(120).nullable(),
  scheduleInteraction: scheduleInteractionSchema,
  listId: entityIdSchema,
  title: titleSchema,
  status: z.literal("open"),
  priority: prioritySchema,
  version: versionSchema,
} as const;

const allDayCalendarEventSchema = z
  .strictObject({
    ...calendarEventFields,
    kind: z.literal("all_day"),
    startDate: localDateSchema,
    endDate: localDateSchema,
  })
  .superRefine((event, context) => {
    validateCalendarEventMetadata(event, context);
    if (compareLocalDates(event.endDate, event.startDate) <= 0) {
      context.addIssue({ code: "custom", message: "An all-day event must end after it starts." });
    }
  });

const timedCalendarEventSchema = z
  .strictObject({
    ...calendarEventFields,
    kind: z.literal("timed"),
    startAt: instantSchema,
    endAt: instantSchema,
    timezone: ianaTimeZoneSchema,
  })
  .superRefine((event, context) => {
    validateCalendarEventMetadata(event, context);
    if (compareInstants(event.endAt, event.startAt) < 0) {
      context.addIssue({ code: "custom", message: "A timed event cannot end before it starts." });
    }
  });

export const calendarEventDtoSchema = z.discriminatedUnion("kind", [
  allDayCalendarEventSchema,
  timedCalendarEventSchema,
]);

export const calendarProjectionSchema = z
  .strictObject({
    rangeStartDate: localDateSchema,
    rangeEndDate: localDateSchema,
    rangeStartAt: instantSchema,
    rangeEndAt: instantSchema,
    timeZone: ianaTimeZoneSchema,
    events: z.array(calendarEventDtoSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    ...planningProjectionTruncationFields,
  })
  .superRefine((projection, context) => {
    validatePlanningProjectionTruncation(projection, context);
    validateUniqueProjectionRows(projection.events, "Calendar", context);
  });

export const agendaRowSchema = z.strictObject({
  groupDate: localDateSchema,
  event: calendarEventDtoSchema,
});

export const agendaProjectionSchema = z
  .strictObject({
    rangeStartDate: localDateSchema,
    rangeEndDate: localDateSchema,
    rangeStartAt: instantSchema,
    rangeEndAt: instantSchema,
    timeZone: ianaTimeZoneSchema,
    items: z.array(agendaRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    ...planningProjectionTruncationFields,
  })
  .superRefine((projection, context) => {
    validatePlanningProjectionTruncation(projection, context);
    validateUniqueProjectionRows(
      projection.items.map((row) => row.event),
      "Agenda",
      context,
    );
  });

export const eisenhowerProjectionSchema = z
  .strictObject({
    timeZone: ianaTimeZoneSchema,
    nowAt: instantSchema,
    urgentThroughAt: instantSchema,
    doNow: z.array(planningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    plan: z.array(planningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    timeSensitive: z.array(planningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    later: z.array(planningTaskRowSchema).max(PLANNING_PROJECTION_MAX_ROWS),
    ...planningProjectionTruncationFields,
  })
  .superRefine((projection, context) => {
    validatePlanningProjectionTruncation(projection, context);
    validateUniqueProjectionRows(
      [...projection.doNow, ...projection.plan, ...projection.timeSensitive, ...projection.later],
      "Matrix",
      context,
    );
  });

export type AgendaProjection = z.infer<typeof agendaProjectionSchema>;
export type AgendaRow = z.infer<typeof agendaRowSchema>;
export type CalendarEventDto = z.infer<typeof calendarEventDtoSchema>;
export type CalendarProjection = z.infer<typeof calendarProjectionSchema>;
export type EisenhowerProjection = z.infer<typeof eisenhowerProjectionSchema>;
export type PlanningTaskRow = z.infer<typeof planningTaskRowSchema>;
export type ProjectionLifecycle = z.infer<typeof projectionLifecycleSchema>;
export type TodayProjection = z.infer<typeof todayProjectionSchema>;
export type UpcomingProjection = z.infer<typeof upcomingProjectionSchema>;
export type { PlanningProjectionTruncationReason } from "./projection-truncation";
