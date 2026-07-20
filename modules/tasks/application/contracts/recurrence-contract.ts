import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  assertRecurrenceProjectionWindow,
  type RecurrenceProjectionWindow,
} from "../../domain/recurrence/recurrence-cutover-policy";
import {
  RECURRENCE_COUNT_MAX,
  RECURRENCE_COUNT_MIN,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_INTERVAL_MIN,
} from "../../domain/recurrence/recurrence-policy";
import {
  assertRecurrenceEligibility,
  assertRecurrenceScheduleAnchor,
  type RecurrenceScheduleAnchor,
} from "../../domain/recurrence/recurrence-time-policy";
import {
  entityIdSchema,
  expectedVersionRequestSchema,
  isoTimestampSchema,
  versionSchema,
  versionedResourceReferenceSchema,
} from "./contract-primitives";
import { localDateSchema, taskScheduleValueSchema } from "./schedule-contract";

export {
  RECURRENCE_COUNT_MAX,
  RECURRENCE_COUNT_MIN,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_INTERVAL_MIN,
} from "../../domain/recurrence/recurrence-policy";

export const recurrenceIntervalSchema = z
  .number()
  .int()
  .min(RECURRENCE_INTERVAL_MIN)
  .max(RECURRENCE_INTERVAL_MAX);
export const recurrenceCountSchema = z.number().int().min(RECURRENCE_COUNT_MIN).max(RECURRENCE_COUNT_MAX);
export const isoWeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const selectedWeekdaysSchema = z
  .array(isoWeekdaySchema)
  .min(1)
  .max(7)
  .superRefine((weekdays, context) => {
    if (new Set(weekdays).size !== weekdays.length) {
      context.addIssue({ code: "custom", message: "Selected weekdays must be unique." });
    }
    if (weekdays.some((weekday, index) => index > 0 && weekday <= weekdays[index - 1]!)) {
      context.addIssue({
        code: "custom",
        message: "Selected weekdays must be sorted in ascending ISO weekday order.",
      });
    }
  });

export const recurrencePresetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("daily"), interval: recurrenceIntervalSchema }),
  z.strictObject({ kind: z.literal("weekdays"), interval: recurrenceIntervalSchema }),
  z.strictObject({
    kind: z.literal("weekly"),
    interval: recurrenceIntervalSchema,
    weekdays: selectedWeekdaysSchema,
  }),
  z.strictObject({ kind: z.literal("monthly"), interval: recurrenceIntervalSchema }),
  z.strictObject({ kind: z.literal("yearly"), interval: recurrenceIntervalSchema }),
]);

export const recurrenceEndSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("never") }),
  z.strictObject({ kind: z.literal("until"), untilDate: localDateSchema }),
  z.strictObject({ kind: z.literal("count"), count: recurrenceCountSchema }),
]);

export const recurrenceDefinitionSchema = z.strictObject({
  preset: recurrencePresetSchema,
  end: recurrenceEndSchema,
});

const allDayProjectionCutoverSchema = z.strictObject({
  kind: z.literal("all_day"),
  projectionStartDate: localDateSchema,
  projectionEndDate: localDateSchema.nullable(),
});

const timedProjectionCutoverSchema = z.strictObject({
  kind: z.literal("timed"),
  projectionStartAt: isoTimestampSchema,
  projectionEndAt: isoTimestampSchema.nullable(),
});

export const recurrenceProjectionCutoverSchema = z
  .discriminatedUnion("kind", [allDayProjectionCutoverSchema, timedProjectionCutoverSchema])
  .superRefine((cutover, context) => {
    try {
      assertRecurrenceProjectionWindow(cutover satisfies RecurrenceProjectionWindow);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "The recurrence cutover is invalid.",
      });
    }
  });

export const recurrenceLifecycleSchema = z.enum(["active", "dormant", "ended", "exhausted"]);

export const taskRecurrenceDtoSchema = z
  .strictObject({
    taskId: entityIdSchema,
    taskVersion: versionSchema,
    generationMode: z.literal("schedule"),
    timezone: ianaTimeZoneSchema,
    definition: recurrenceDefinitionSchema,
    cutover: recurrenceProjectionCutoverSchema,
    lifecycle: recurrenceLifecycleSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .superRefine(({ cutover, lifecycle }, context) => {
    const hasUpperCutover =
      cutover.kind === "all_day" ? cutover.projectionEndDate !== null : cutover.projectionEndAt !== null;
    if ((lifecycle === "ended") !== hasUpperCutover) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle"],
        message: "Only an ended recurrence has an upper projection cutover.",
      });
    }
  });

export const recurringTaskScheduleValueSchema = taskScheduleValueSchema.superRefine((schedule, context) => {
  const error = recurrenceScheduleEligibilityError(schedule);
  if (error !== null) context.addIssue({ code: "custom", message: error });
});

export const setTaskRecurrenceRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  definition: recurrenceDefinitionSchema,
});

export const editRecurringTaskScheduleRequestSchema = z
  .strictObject({
    expectedVersion: versionSchema,
    definition: recurrenceDefinitionSchema,
    schedule: recurringTaskScheduleValueSchema,
  })
  .superRefine(validateDefinitionAgainstSchedule);

export const endTaskRecurrenceRequestSchema = expectedVersionRequestSchema;

export const taskRecurrenceMutationResultSchema = z
  .strictObject({
    task: versionedResourceReferenceSchema,
    recurrence: taskRecurrenceDtoSchema,
  })
  .superRefine(({ recurrence, task }, context) => {
    if (recurrence.taskId !== task.id || recurrence.taskVersion !== task.version) {
      context.addIssue({
        code: "custom",
        path: ["recurrence"],
        message: "The recurrence must carry the mutated task identity and version.",
      });
    }
  });

export const recurrenceCommandFailureSchema = z.discriminatedUnion("reason", [
  z.strictObject({ reason: z.literal("resource_unavailable"), code: z.literal("NOT_FOUND") }),
  z.strictObject({ reason: z.literal("schedule_required"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({ reason: z.literal("root_task_required"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({ reason: z.literal("owner_not_open"), code: z.literal("CONFLICT") }),
  z.strictObject({ reason: z.literal("recurrence_already_exists"), code: z.literal("CONFLICT") }),
  z.strictObject({ reason: z.literal("recurrence_not_found"), code: z.literal("CONFLICT") }),
  z.strictObject({ reason: z.literal("anchor_weekday_mismatch"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({ reason: z.literal("schedule_not_whole_minute"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({ reason: z.literal("duration_out_of_range"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({ reason: z.literal("later_dst_fold_anchor"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({ reason: z.literal("end_condition_exhausted"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({
    reason: z.literal("stale_version"),
    code: z.literal("CONFLICT"),
    currentVersion: versionSchema,
  }),
]);

export type EditRecurringTaskScheduleRequest = z.infer<typeof editRecurringTaskScheduleRequestSchema>;
export type EndTaskRecurrenceRequest = z.infer<typeof endTaskRecurrenceRequestSchema>;
export type RecurrenceCommandFailure = z.infer<typeof recurrenceCommandFailureSchema>;
export type RecurrenceDefinition = z.infer<typeof recurrenceDefinitionSchema>;
export type RecurrenceLifecycle = z.infer<typeof recurrenceLifecycleSchema>;
export type RecurrencePreset = z.infer<typeof recurrencePresetSchema>;
export type RecurrenceProjectionCutover = z.infer<typeof recurrenceProjectionCutoverSchema>;
export type SetTaskRecurrenceRequest = z.infer<typeof setTaskRecurrenceRequestSchema>;
export type TaskRecurrenceDto = z.infer<typeof taskRecurrenceDtoSchema>;
export type TaskRecurrenceMutationResult = z.infer<typeof taskRecurrenceMutationResultSchema>;

type RecurringSchedule = z.infer<typeof recurringTaskScheduleValueSchema>;

function recurrenceScheduleEligibilityError(schedule: RecurringSchedule): string | null {
  try {
    assertRecurrenceScheduleAnchor(toDomainAnchor(schedule));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "The recurring schedule is not eligible.";
  }
}

function validateDefinitionAgainstSchedule(
  value: Readonly<{ definition: RecurrenceDefinition; schedule: RecurringSchedule }>,
  context: z.RefinementCtx,
) {
  try {
    assertRecurrenceEligibility(value.definition, toDomainAnchor(value.schedule));
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["definition"],
      message: error instanceof Error ? error.message : "The recurrence definition is not eligible.",
    });
  }
}

function toDomainAnchor(schedule: RecurringSchedule): RecurrenceScheduleAnchor {
  if (schedule.kind === "timed") return schedule;
  // All-day recurrence dates are zone-independent at this boundary. The application use case supplies
  // the actor's authoritative timezone when it persists the definition.
  return { ...schedule, timezone: "UTC" };
}
