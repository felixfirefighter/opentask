import { z } from "zod";

import {
  assertRecurrenceRangeBounds,
  MAX_RECURRENCE_CANDIDATES_PER_REQUEST,
  MAX_RECURRENCE_CANDIDATES_PER_SERIES,
  MAX_RECURRENCE_ROWS_PER_REQUEST,
  MAX_SCHEDULE_AND_OCCURRENCE_ROWS,
} from "../../domain/recurrence/recurrence-limits";
import {
  entityIdSchema,
  isoTimestampSchema,
  versionSchema,
  versionedResourceReferenceSchema,
} from "./contract-primitives";
import { localDateSchema, taskScheduleDtoSchema, taskScheduleValueSchema } from "./schedule-contract";
import { taskDtoSchema } from "./task-contract";

export const OCCURRENCE_PROJECTION_LIMIT = MAX_SCHEDULE_AND_OCCURRENCE_ROWS;
export const RECURRENCE_SOURCE_LIMIT = MAX_RECURRENCE_ROWS_PER_REQUEST;
export const RECURRENCE_CANDIDATE_LIMIT_PER_SERIES = MAX_RECURRENCE_CANDIDATES_PER_SERIES;
export const RECURRENCE_CANDIDATE_LIMIT_PER_REQUEST = MAX_RECURRENCE_CANDIDATES_PER_REQUEST;
export const OCCURRENCE_EVENT_SOURCE_LIMIT = 50_000;

export const occurrenceKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^o1\.[A-Za-z0-9_-]+$/, "The occurrence identity is invalid.");
export const occurrenceStateSchema = z.enum(["open", "completed", "skipped"]);

export const taskOccurrenceDtoSchema = z.strictObject({
  taskId: entityIdSchema,
  taskVersion: versionSchema,
  occurrenceKey: occurrenceKeySchema,
  occurrenceState: occurrenceStateSchema,
  schedule: taskScheduleValueSchema,
});

const oneOffTaskProjectionSchema = z
  .strictObject({
    projectionKind: z.literal("one_off"),
    task: taskDtoSchema,
    schedule: taskScheduleDtoSchema,
  })
  .superRefine(({ schedule, task }, context) => {
    if (schedule.taskId !== task.id) {
      context.addIssue({
        code: "custom",
        path: ["schedule", "taskId"],
        message: "The schedule must belong to the projected task.",
      });
    }
  });

const recurringTaskProjectionSchema = z
  .strictObject({
    projectionKind: z.literal("recurring"),
    task: taskDtoSchema,
    occurrence: taskOccurrenceDtoSchema,
  })
  .superRefine(({ occurrence, task }, context) => {
    if (occurrence.taskId !== task.id) {
      context.addIssue({
        code: "custom",
        path: ["occurrence", "taskId"],
        message: "The occurrence must belong to the projected task.",
      });
    }
    if (occurrence.taskVersion !== task.version) {
      context.addIssue({
        code: "custom",
        path: ["occurrence", "taskVersion"],
        message: "The occurrence must carry the projected task version.",
      });
    }
  });

export const boundedTaskProjectionSchema = z.discriminatedUnion("projectionKind", [
  oneOffTaskProjectionSchema,
  recurringTaskProjectionSchema,
]);

export const taskOccurrenceRangeQuerySchema = z
  .strictObject({
    rangeStartDate: localDateSchema,
    rangeEndDate: localDateSchema,
    rangeStartAt: isoTimestampSchema,
    rangeEndAt: isoTimestampSchema,
    limit: z.coerce.number().int().min(1).max(OCCURRENCE_PROJECTION_LIMIT).default(250),
  })
  .superRefine((range, context) => {
    try {
      assertRecurrenceRangeBounds(
        range.rangeStartDate,
        range.rangeEndDate,
        range.rangeStartAt,
        range.rangeEndAt,
      );
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "The occurrence range is invalid.",
      });
    }
  });

export const occurrenceTruncationReasonSchema = z.enum([
  "source_limit",
  "event_source_limit",
  "series_candidate_limit",
  "request_candidate_limit",
  "output_limit",
]);

export const occurrenceTruncationSchema = z
  .strictObject({
    truncated: z.boolean(),
    reasons: z
      .array(occurrenceTruncationReasonSchema)
      .max(5)
      .refine((reasons) => new Set(reasons).size === reasons.length, "Truncation reasons must be unique."),
    recurrenceRowsEvaluated: z.number().int().min(0).max(RECURRENCE_SOURCE_LIMIT),
    occurrenceEventsEvaluated: z.number().int().min(0).max(OCCURRENCE_EVENT_SOURCE_LIMIT),
    candidateEvaluations: z.number().int().min(0).max(RECURRENCE_CANDIDATE_LIMIT_PER_REQUEST),
  })
  .refine(({ reasons, truncated }) => truncated === reasons.length > 0, {
    path: ["reasons"],
    message: "Truncation reasons must match the truncation flag.",
  });

export const boundedTaskOccurrencePageSchema = z.strictObject({
  items: z.array(boundedTaskProjectionSchema).max(OCCURRENCE_PROJECTION_LIMIT),
  truncation: occurrenceTruncationSchema,
});

const occurrenceCommandBase = {
  occurrenceKey: occurrenceKeySchema,
  expectedVersion: versionSchema,
} as const;

export const occurrenceCommandRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("complete"), ...occurrenceCommandBase }),
  z.strictObject({ action: z.literal("skip"), ...occurrenceCommandBase }),
  z.strictObject({ action: z.literal("undo"), ...occurrenceCommandBase }),
]);

const occurrenceCommandResultFields = {
  action: z.enum(["complete", "skip", "undo"]),
  occurrenceKey: occurrenceKeySchema,
  expectedVersion: versionSchema,
  task: versionedResourceReferenceSchema,
  occurrenceState: occurrenceStateSchema,
} as const;

export const occurrenceCommandResultSchema = z
  .discriminatedUnion("outcome", [
    z.strictObject({
      outcome: z.literal("applied"),
      ...occurrenceCommandResultFields,
      eventTaskVersion: versionSchema,
    }),
    z.strictObject({
      outcome: z.literal("idempotent_retry"),
      ...occurrenceCommandResultFields,
      eventTaskVersion: versionSchema,
    }),
    z.strictObject({
      outcome: z.literal("no_op"),
      ...occurrenceCommandResultFields,
      eventTaskVersion: versionSchema.nullable(),
    }),
  ])
  .superRefine((result, context) => {
    const expectedState =
      result.action === "complete" ? "completed" : result.action === "skip" ? "skipped" : "open";
    if (result.occurrenceState !== expectedState) {
      context.addIssue({
        code: "custom",
        path: ["occurrenceState"],
        message: "The occurrence state must match the requested action.",
      });
    }

    if (result.outcome === "no_op") {
      if (result.task.version !== result.expectedVersion) {
        context.addIssue({
          code: "custom",
          path: ["task", "version"],
          message: "A no-op must retain the expected task version.",
        });
      }
      if (result.eventTaskVersion !== null && result.eventTaskVersion > result.task.version) {
        context.addIssue({
          code: "custom",
          path: ["eventTaskVersion"],
          message: "An effective event cannot be newer than the task.",
        });
      }
      return;
    }

    const appliedVersion = result.expectedVersion + 1;
    if (result.eventTaskVersion !== appliedVersion) {
      context.addIssue({
        code: "custom",
        path: ["eventTaskVersion"],
        message: "An applied event must use expectedVersion + 1.",
      });
    }
    const validTaskVersion =
      result.outcome === "applied"
        ? result.task.version === appliedVersion
        : result.task.version >= appliedVersion;
    if (!validTaskVersion) {
      context.addIssue({
        code: "custom",
        path: ["task", "version"],
        message: "The task version is inconsistent with the command outcome.",
      });
    }
  });

export const occurrenceCommandFailureSchema = z.discriminatedUnion("reason", [
  z.strictObject({ reason: z.literal("resource_unavailable"), code: z.literal("NOT_FOUND") }),
  z.strictObject({ reason: z.literal("occurrence_not_eligible"), code: z.literal("VALIDATION_FAILED") }),
  z.strictObject({
    reason: z.literal("series_not_active"),
    code: z.literal("CONFLICT"),
    currentVersion: versionSchema,
  }),
  z.strictObject({
    reason: z.literal("stale_version"),
    code: z.literal("CONFLICT"),
    currentVersion: versionSchema,
  }),
]);

export type BoundedTaskOccurrencePage = z.infer<typeof boundedTaskOccurrencePageSchema>;
export type BoundedTaskProjection = z.infer<typeof boundedTaskProjectionSchema>;
export type OccurrenceCommandFailure = z.infer<typeof occurrenceCommandFailureSchema>;
export type OccurrenceCommandRequest = z.infer<typeof occurrenceCommandRequestSchema>;
export type OccurrenceCommandResult = z.infer<typeof occurrenceCommandResultSchema>;
export type OccurrenceKey = z.infer<typeof occurrenceKeySchema>;
export type OccurrenceState = z.infer<typeof occurrenceStateSchema>;
export type OccurrenceTruncation = z.infer<typeof occurrenceTruncationSchema>;
export type TaskOccurrenceDto = z.infer<typeof taskOccurrenceDtoSchema>;
export type TaskOccurrenceRangeQuery = z.infer<typeof taskOccurrenceRangeQuerySchema>;
