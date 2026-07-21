import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { entityIdSchema, versionSchema } from "./contract-primitives";

export const taskReminderOffsetMinutesSchema = z.number().int().min(0).max(10_080);

export const taskRecurrenceReminderResolutionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("remove"),
    expectedReminderVersion: versionSchema,
  }),
  z.strictObject({
    kind: z.literal("convert_relative_start"),
    expectedReminderVersion: versionSchema,
    offsetMinutes: taskReminderOffsetMinutesSchema,
  }),
]);

export type TaskRecurrenceReminderResolution = z.infer<typeof taskRecurrenceReminderResolutionSchema>;

export type TaskReminderRelativeStart = Readonly<{
  startAt: Date;
  occurrenceKey: string | null;
}>;

export type TaskReminderSource = Readonly<{
  taskId: string;
  status: "open" | "completed" | "cancelled";
  deleted: boolean;
  recurring: boolean;
  relativeStart: TaskReminderRelativeStart | null;
}>;

export type TaskReminderSourceRead = Readonly<{
  taskId: string;
  relativeStartAfter: Date;
  lock: boolean;
}>;

/** Authorized, transaction-aware task state required to decide reminder eligibility. */
export interface TaskReminderSourceReader {
  readOwned(
    actor: AuthenticatedActor,
    input: TaskReminderSourceRead,
    executor?: DatabaseExecutor,
  ): Promise<TaskReminderSource | null>;
}

export const reminderRelevantTaskChangeReasons = [
  "schedule_changed",
  "task_deleted",
  "task_terminal",
  "occurrence_terminal",
  "obsolete",
] as const;

export type ReminderRelevantTaskChangeReason = (typeof reminderRelevantTaskChangeReasons)[number];

export type ReminderRelevantTaskChange = Readonly<{
  taskIds: readonly string[];
  reason: ReminderRelevantTaskChangeReason;
}>;

export type ApplyTaskRecurrenceReminderResolution = Readonly<{
  taskId: string;
  resolution: TaskRecurrenceReminderResolution | null;
}>;

export interface TaskReminderReconciler {
  prepare(actor: AuthenticatedActor, taskIds: readonly string[]): Promise<void>;
  reconcile(
    actor: AuthenticatedActor,
    change: ReminderRelevantTaskChange,
    executor: DatabaseExecutor,
  ): Promise<void>;
  applyRecurrenceResolution(
    actor: AuthenticatedActor,
    input: ApplyTaskRecurrenceReminderResolution,
    executor: DatabaseExecutor,
  ): Promise<void>;
}

/**
 * Signals that reconciliation discovered a reminder after the producer preflight.
 * The enclosing task transaction must roll back, prepare these owners, and retry once.
 */
export class ReminderProducerPreparationRequiredError extends Error {
  readonly taskIds: readonly string[];

  constructor(taskIds: readonly string[]) {
    super("Reminder producer preparation is required before this task transaction can commit.");
    this.name = "ReminderProducerPreparationRequiredError";
    this.taskIds = normalizeReminderTaskIds(taskIds);
  }
}

export function normalizeReminderTaskIds(taskIds: readonly string[]): readonly string[] {
  return [...new Set(taskIds.map((taskId) => entityIdSchema.parse(taskId)))].sort();
}

export const noopTaskReminderReconciler: TaskReminderReconciler = Object.freeze({
  async prepare() {},
  async reconcile() {},
  async applyRecurrenceResolution() {},
});
