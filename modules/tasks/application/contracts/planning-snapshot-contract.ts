import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  taskPlanningSourcePageSchema,
  taskPlanningSourceQuerySchema,
  type TaskPlanningSourcePage,
} from "./planning-source-contract";
import {
  boundedTaskOccurrencePageSchema,
  taskOccurrenceRangeQuerySchema,
  type BoundedTaskOccurrencePage,
} from "./occurrence-contract";

export const taskPlanningSnapshotRequestSchema = z.strictObject({
  timeZone: ianaTimeZoneSchema,
  taskQuery: taskPlanningSourceQuerySchema,
  occurrenceQueries: z.array(taskOccurrenceRangeQuerySchema).min(1).max(2),
});

export const taskPlanningSnapshotResultSchema = z.strictObject({
  taskPage: taskPlanningSourcePageSchema,
  occurrencePages: z.array(boundedTaskOccurrencePageSchema).min(1).max(2),
});

export type TaskPlanningSnapshotRequest = z.infer<typeof taskPlanningSnapshotRequestSchema>;
export type TaskPlanningSnapshotResult = Readonly<{
  taskPage: TaskPlanningSourcePage;
  occurrencePages: readonly BoundedTaskOccurrencePage[];
}>;

export interface TaskPlanningSnapshotReader {
  readPlanningSnapshot(
    actor: AuthenticatedActor,
    request: TaskPlanningSnapshotRequest,
  ): Promise<TaskPlanningSnapshotResult>;
}
