import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";

import { assertScheduleQueryBounds } from "../../domain/schedule/schedule-bounds";
import { isoTimestampSchema } from "./contract-primitives";
import { localDateSchema, taskScheduleDtoSchema } from "./schedule-contract";
import { taskDtoSchema } from "./task-contract";

const planningSourceLimitSchema = z.number().int().min(1).max(500);

const scheduledThroughQuerySchema = z.strictObject({
  kind: z.literal("scheduled_through"),
  exclusiveEndDate: localDateSchema,
  exclusiveEndAt: isoTimestampSchema,
  limit: planningSourceLimitSchema,
});

const scheduledRangeQuerySchema = z
  .strictObject({
    kind: z.literal("scheduled_range"),
    rangeStartDate: localDateSchema,
    rangeEndDate: localDateSchema,
    rangeStartAt: isoTimestampSchema,
    rangeEndAt: isoTimestampSchema,
    limit: planningSourceLimitSchema,
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
        message: error instanceof Error ? error.message : "The planning range is invalid.",
      });
    }
  });

const allOpenQuerySchema = z.strictObject({
  kind: z.literal("all_open"),
  limit: planningSourceLimitSchema,
});

export const taskPlanningSourceQuerySchema = z.discriminatedUnion("kind", [
  scheduledThroughQuerySchema,
  scheduledRangeQuerySchema,
  allOpenQuerySchema,
]);

export const canonicalTaskPlanningRowSchema = z.strictObject({
  task: taskDtoSchema,
  schedule: taskScheduleDtoSchema.nullable(),
  recurrenceRoot: z.boolean(),
});

export const taskPlanningSourcePageSchema = z.strictObject({
  items: z.array(canonicalTaskPlanningRowSchema).max(500),
  truncated: z.boolean(),
});

export type CanonicalTaskPlanningRow = z.infer<typeof canonicalTaskPlanningRowSchema>;
export type TaskPlanningSourcePage = z.infer<typeof taskPlanningSourcePageSchema>;
export type TaskPlanningSourceQuery = z.infer<typeof taskPlanningSourceQuerySchema>;

export interface TaskPlanningSourceReader {
  readOpenTasks(actor: AuthenticatedActor, query: TaskPlanningSourceQuery): Promise<TaskPlanningSourcePage>;
}
