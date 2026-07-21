import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  occurrenceCommandRequestSchema,
  occurrenceCommandResultSchema,
  occurrenceStateSchema,
  type OccurrenceCommandRequest,
  type OccurrenceCommandResult,
  type OccurrenceState,
} from "./contracts/occurrence-contract";
import { noopTaskReminderReconciler, type TaskReminderReconciler } from "./contracts/task-reminder-contract";
import { entityIdSchema } from "./contracts/contract-primitives";
import { isEligibleOccurrence } from "./occurrence-projection-support";
import { runReminderRelevantTaskTransaction } from "./reminder-relevant-transaction";
import { parseStoredRecurrence } from "./recurrence-application-support";
import { requireAppliedTask } from "./task-application-support";
import { staleTaskResource, taskConflict, taskResourceNotFound, taskValidationFailure } from "./task-errors";
import { decodeOccurrenceKey } from "../domain/recurrence/occurrence-key";
import {
  decideOccurrenceState,
  type OccurrenceStateDecision,
} from "../domain/recurrence/occurrence-state-policy";
import {
  createTaskOccurrenceEventRepository,
  type StoredTaskOccurrenceEvent,
} from "../infrastructure/task-occurrence-event-repository";
import { createTaskRecurrenceRepository } from "../infrastructure/task-recurrence-repository";
import { createTaskScheduleRepository } from "../infrastructure/task-schedule-repository";
import { createTaskRepository, type StoredTask } from "../infrastructure/task-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

export type OccurrenceEventIdFactory = () => string;

export function createOccurrenceCommand(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    taskSchedules: TaskScheduleTable;
    createEventId: OccurrenceEventIdFactory;
    reminderReconciler?: TaskReminderReconciler;
  }>,
) {
  const tasks = createTaskRepository(dependencies.database);
  const recurrences = createTaskRecurrenceRepository(dependencies.database);
  const schedules = createTaskScheduleRepository(dependencies.taskSchedules, dependencies.database);
  const events = createTaskOccurrenceEventRepository(dependencies.database);

  return async function transitionOccurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawRequest: OccurrenceCommandRequest,
  ): Promise<OccurrenceCommandResult> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const request = occurrenceCommandRequestSchema.parse(rawRequest);
    const decoded = domainValidation(() => decodeOccurrenceKey(request.occurrenceKey, taskId));
    return runReminderRelevantTaskTransaction({
      actor,
      database: dependencies.database,
      prepareTaskIds: [taskId],
      reconciler: dependencies.reminderReconciler ?? noopTaskReminderReconciler,
      execute: async (transaction) => {
        const task = await tasks.lockById(actor.userId, taskId, "any", transaction);
        if (!task) throw taskResourceNotFound();
        const recurrence = await recurrences.lockByTaskId(actor.userId, taskId, transaction);
        const schedule = await schedules.lockByTaskId(actor.userId, taskId, transaction);
        const latest = await events.findLatest(actor.userId, taskId, request.occurrenceKey, transaction);
        const targetState = targetOccurrenceState(request.action);
        const decision = domainValidation(() =>
          decideOccurrenceState({
            currentTaskVersion: task.version,
            expectedVersion: request.expectedVersion,
            targetState,
            events: latest
              ? [{ state: occurrenceStateSchema.parse(latest.state), taskVersion: latest.taskVersion }]
              : [],
          }),
        );

        if (decision.kind === "replay") {
          return { value: commandResult(request, task, targetState, decision, latest), change: null };
        }
        if (decision.kind === "stale") throw staleTaskResource(task.version);
        assertSeriesOwnerActive(task);
        if (!recurrence || !schedule) {
          throw taskConflict("This recurring series is no longer active.", task.version);
        }
        const parsed = domainValidation(() => parseStoredRecurrence(recurrence, schedule));
        const eligibleUnderCurrentRule =
          request.action === "undo"
            ? false
            : domainValidation(() =>
                isEligibleOccurrence({
                  rule: parsed.definition,
                  anchor: parsed.anchor,
                  projection: parsed.projection,
                  decoded,
                }),
              );
        validateOccurrenceTarget(request, latest, eligibleUnderCurrentRule);
        if (decision.kind === "no_op") {
          return { value: commandResult(request, task, targetState, decision, latest), change: null };
        }

        const now = dependencies.clock.now();
        const updated = requireAppliedTask(
          await tasks.incrementVersion(
            { userId: actor.userId, id: task.id, expectedVersion: request.expectedVersion, now },
            transaction,
          ),
        );
        const event = await events.append(
          {
            id: dependencies.createEventId(),
            userId: actor.userId,
            taskId: task.id,
            occurrenceKey: request.occurrenceKey,
            state: targetState,
            taskVersion: updated.version,
            effectiveAt: now,
          },
          transaction,
        );
        const value = occurrenceCommandResultSchema.parse({
          outcome: "applied",
          action: request.action,
          occurrenceKey: request.occurrenceKey,
          expectedVersion: request.expectedVersion,
          task: { id: updated.id, version: updated.version },
          occurrenceState: targetState,
          eventTaskVersion: event.taskVersion,
        });
        return { value, change: { taskIds: [taskId], reason: "occurrence_terminal" } };
      },
    });
  };
}

function validateOccurrenceTarget(
  request: OccurrenceCommandRequest,
  latest: StoredTaskOccurrenceEvent | null,
  eligibleUnderCurrentRule: boolean,
): void {
  if (request.action === "undo") {
    if (!latest) {
      throw taskValidationFailure("Only a recorded occurrence transition can be undone.");
    }
    return;
  }
  if (!eligibleUnderCurrentRule) {
    throw taskValidationFailure("This occurrence is not eligible under the current recurrence rule.");
  }
}

function commandResult(
  request: OccurrenceCommandRequest,
  task: StoredTask,
  targetState: OccurrenceState,
  decision: Extract<OccurrenceStateDecision, { kind: "replay" | "no_op" }>,
  latest: StoredTaskOccurrenceEvent | null,
): OccurrenceCommandResult {
  return occurrenceCommandResultSchema.parse({
    outcome: decision.kind === "replay" ? "idempotent_retry" : "no_op",
    action: request.action,
    occurrenceKey: request.occurrenceKey,
    expectedVersion: request.expectedVersion,
    task: { id: task.id, version: task.version },
    occurrenceState: targetState,
    eventTaskVersion: decision.kind === "replay" ? decision.event.taskVersion : (latest?.taskVersion ?? null),
  });
}

function assertSeriesOwnerActive(task: StoredTask) {
  if (task.deletedAt !== null || task.status !== "open") {
    throw taskConflict("This recurring series is not active.", task.version);
  }
}

function targetOccurrenceState(action: OccurrenceCommandRequest["action"]): OccurrenceState {
  if (action === "complete") return "completed";
  if (action === "skip") return "skipped";
  return "open";
}

function domainValidation<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RangeError) throw taskValidationFailure(error.message);
    throw error;
  }
}
