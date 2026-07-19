import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  assertAllDayScheduleBounds,
  assertScheduleQueryBounds,
  assertTimedScheduleBounds,
} from "../../domain/schedule/schedule-bounds";
import {
  databaseSafeTextSchema,
  entityIdSchema,
  expectedVersionRequestSchema,
  isoTimestampSchema,
  taskDescriptionSchema,
  taskPrioritySchema,
  taskTitleSchema,
  versionSchema,
  versionedResourceReferenceSchema,
} from "./contract-primitives";
import { taskDtoSchema } from "./task-contract";

export const localDateSchema = z.iso.date();

const allDayScheduleValueSchema = z.strictObject({
  kind: z.literal("all_day"),
  startDate: localDateSchema,
  endDate: localDateSchema,
});

const timedScheduleValueSchema = z.strictObject({
  kind: z.literal("timed"),
  startAt: isoTimestampSchema,
  endAt: isoTimestampSchema,
  timezone: ianaTimeZoneSchema,
});

export const taskScheduleValueSchema = z
  .discriminatedUnion("kind", [allDayScheduleValueSchema, timedScheduleValueSchema])
  .superRefine(validateScheduleBounds);

const scheduleDtoFields = {
  taskId: entityIdSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
} as const;

export const taskScheduleDtoSchema = z
  .discriminatedUnion("kind", [
    allDayScheduleValueSchema.extend(scheduleDtoFields),
    timedScheduleValueSchema.extend(scheduleDtoFields),
  ])
  .superRefine(validateScheduleBounds);

export const setTaskScheduleRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  schedule: taskScheduleValueSchema,
});

export const clearTaskScheduleRequestSchema = expectedVersionRequestSchema;

export const taskScheduleMutationResultSchema = z.strictObject({
  task: versionedResourceReferenceSchema,
  schedule: taskScheduleDtoSchema.nullable(),
});

export const taskScheduleRangeQuerySchema = z
  .strictObject({
    rangeStartDate: localDateSchema,
    rangeEndDate: localDateSchema,
    rangeStartAt: isoTimestampSchema,
    rangeEndAt: isoTimestampSchema,
    limit: z.coerce.number().int().min(1).max(500).default(250),
  })
  .superRefine((range, context) => {
    try {
      assertScheduleQueryBounds(
        range.rangeStartDate,
        range.rangeEndDate,
        range.rangeStartAt,
        range.rangeEndAt,
      );
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "The schedule range is invalid.",
      });
    }
  });

export const scheduledTaskDtoSchema = z.strictObject({
  task: taskDtoSchema,
  schedule: taskScheduleDtoSchema,
});

export const taskScheduleRangePageSchema = z.strictObject({
  items: z.array(scheduledTaskDtoSchema).max(500),
  truncated: z.boolean(),
});

export const taskSnapshotDtoSchema = z.strictObject({
  id: entityIdSchema,
  title: taskTitleSchema,
  descriptionMd: taskDescriptionSchema,
  priority: taskPrioritySchema,
  version: versionSchema,
});

export const taskSnapshotIdSelectionSchema = z
  .array(entityIdSchema)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Selected task IDs must be unique.");

export const quickAddTextSchema = databaseSafeTextSchema
  .refine((value) => value.trim().length > 0, "Quick-add text cannot be blank.")
  .refine((value) => Array.from(value).length <= 500, "Quick-add text is too long.");

export const quickAddRequestSchema = z.strictObject({
  text: quickAddTextSchema,
  timezone: ianaTimeZoneSchema,
});

export const quickAddSuggestionSchema = z.strictObject({
  recognizedText: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
  schedule: taskScheduleValueSchema,
  warnings: z.array(z.enum(["dst_gap_shifted_later", "dst_fold_earlier_instance"])).max(2),
});

export const quickAddParseResultSchema = z.strictObject({
  sourceText: quickAddTextSchema,
  suggestions: z.array(quickAddSuggestionSchema).max(8),
});

export type ClearTaskScheduleRequest = z.infer<typeof clearTaskScheduleRequestSchema>;
export type QuickAddParseResult = z.infer<typeof quickAddParseResultSchema>;
export type QuickAddRequest = z.infer<typeof quickAddRequestSchema>;
export type ScheduledTaskDto = z.infer<typeof scheduledTaskDtoSchema>;
export type SetTaskScheduleRequest = z.infer<typeof setTaskScheduleRequestSchema>;
export type TaskScheduleDto = z.infer<typeof taskScheduleDtoSchema>;
export type TaskScheduleMutationResult = z.infer<typeof taskScheduleMutationResultSchema>;
export type TaskScheduleRangePage = z.infer<typeof taskScheduleRangePageSchema>;
export type TaskScheduleRangeQuery = z.infer<typeof taskScheduleRangeQuerySchema>;
export type TaskScheduleValue = z.infer<typeof taskScheduleValueSchema>;
export type TaskSnapshotDto = z.infer<typeof taskSnapshotDtoSchema>;

type ScheduleBounds =
  | Readonly<{ kind: "all_day"; startDate: string; endDate: string }>
  | Readonly<{ kind: "timed"; startAt: string; endAt: string }>;

function validateScheduleBounds(
  schedule: ScheduleBounds,
  context: Readonly<{
    addIssue(issue: Readonly<{ code: "custom"; message: string }>): void;
  }>,
) {
  try {
    if (schedule.kind === "all_day") {
      assertAllDayScheduleBounds(schedule.startDate, schedule.endDate);
    } else {
      assertTimedScheduleBounds(schedule.startAt, schedule.endAt);
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "The schedule bounds are invalid.",
    });
  }
}
