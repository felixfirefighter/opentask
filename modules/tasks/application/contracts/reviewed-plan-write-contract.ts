import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";

import {
  entityIdSchema,
  taskDescriptionSchema,
  taskPrioritySchema,
  taskTitleSchema,
  versionSchema,
} from "./contract-primitives";
import { taskScheduleValueSchema, type TaskScheduleValue } from "./schedule-contract";

const reviewedPlanCreateSchema = z.strictObject({
  id: entityIdSchema,
  title: taskTitleSchema,
  descriptionMd: taskDescriptionSchema,
  priority: taskPrioritySchema,
  schedule: taskScheduleValueSchema.nullable(),
});

const reviewedPlanUpdateSchema = z
  .strictObject({
    id: entityIdSchema,
    expectedVersion: versionSchema,
    title: taskTitleSchema.optional(),
    descriptionMd: taskDescriptionSchema.optional(),
    priority: taskPrioritySchema.optional(),
    schedule: taskScheduleValueSchema.optional(),
  })
  .refine(
    ({ title, descriptionMd, priority, schedule }) =>
      title !== undefined || descriptionMd !== undefined || priority !== undefined || schedule !== undefined,
    "A reviewed task update must change at least one field.",
  );

export const reviewedPlanBatchSchema = z
  .strictObject({
    creates: z.array(reviewedPlanCreateSchema).max(200),
    updates: z.array(reviewedPlanUpdateSchema).max(100),
  })
  .superRefine((batch, context) => {
    const ids = [...batch.creates.map(({ id }) => id), ...batch.updates.map(({ id }) => id)];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "A reviewed plan can target each task only once." });
    }
    if (ids.length > 200) {
      context.addIssue({ code: "custom", message: "A reviewed plan cannot exceed 200 task writes." });
    }
  });

export type ReviewedPlanBatch = z.infer<typeof reviewedPlanBatchSchema>;

export type ReviewedPlanTaskSnapshot = Readonly<{
  id: string;
  title: string;
  descriptionMd: string;
  priority: "none" | "low" | "medium" | "high";
  version: number;
  schedule: TaskScheduleValue | null;
}>;

export interface ReviewedPlanTaskWriter {
  loadOwnedOpenForUpdate(
    actor: AuthenticatedActor,
    taskIds: readonly string[],
    transaction: DatabaseTransaction,
  ): Promise<readonly ReviewedPlanTaskSnapshot[]>;
  loadBusySchedulesForUpdate(
    actor: AuthenticatedActor,
    query: Readonly<{
      rangeStartDate: string;
      rangeEndDate: string;
      rangeStartAt: string;
      rangeEndAt: string;
      limit: 500;
    }>,
    excludedTaskIds: readonly string[],
    transaction: DatabaseTransaction,
  ): Promise<
    Readonly<{
      items: readonly Readonly<{ schedule: TaskScheduleValue }>[];
      truncated: boolean;
    }>
  >;
  applyBatch(
    actor: AuthenticatedActor,
    batch: ReviewedPlanBatch,
    transaction: DatabaseTransaction,
  ): Promise<void>;
}
