import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type { TaskReminderSourceReader } from "@/modules/tasks";
import type { Clock } from "@/shared/time/clock";

import {
  notificationIdSchema,
  removeTaskReminderInputSchema,
  setTaskReminderInputSchema,
  type RemoveTaskReminderInput,
  type SetTaskReminderInput,
  type TaskReminderDto,
} from "./contracts";
import {
  notificationConflict,
  notificationNotFound,
  notificationValidationFailed,
  staleNotification,
} from "./notification-errors";
import { mapTaskReminder, storedReminderPolicySpec, toReminderPolicySpec } from "./notification-mapper";
import type { TaskReminderRepository } from "./notification-ports";
import type { NotificationReconciler } from "./notification-reconciler";
import type { TaskReminderRecord } from "./notification-records";
import {
  assertReminderCanBeSet,
  reminderRelativeStartThreshold,
  sameReminderSpec,
} from "../domain/reminder-policy";

export function createReminderApplication(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    tasks: TaskReminderSourceReader;
    reminders: TaskReminderRepository;
    reconciler: NotificationReconciler;
  }>,
) {
  return {
    async getTaskReminder(actor: AuthenticatedActor, rawTaskId: string): Promise<TaskReminderDto | null> {
      const taskId = notificationIdSchema.parse(rawTaskId);
      const now = dependencies.clock.now();
      const task = await dependencies.tasks.readOwned(actor, {
        taskId,
        relativeStartAfter: now,
        lock: false,
      });
      if (!task) throw notificationNotFound();
      const reminder = await dependencies.reminders.findByTask(actor.userId, taskId, dependencies.database);
      return reminder ? mapTaskReminder(reminder) : null;
    },

    async setTaskReminder(
      actor: AuthenticatedActor,
      rawInput: SetTaskReminderInput,
    ): Promise<TaskReminderDto> {
      const input = setTaskReminderInputSchema.parse(rawInput);
      const spec = toReminderPolicySpec(input.spec);
      await dependencies.reconciler.ensureProducer();

      return dependencies.database.transaction(async (transaction) => {
        const now = dependencies.clock.now();
        const task = await dependencies.tasks.readOwned(
          actor,
          {
            taskId: input.taskId,
            relativeStartAfter: reminderRelativeStartThreshold(spec, now),
            lock: true,
          },
          transaction,
        );
        if (!task) throw notificationNotFound();
        const current = await dependencies.reminders.findByTask(
          actor.userId,
          input.taskId,
          transaction,
          true,
        );
        const replay = resolveSetReplay(current, input);
        if (replay) return mapTaskReminder(replay);

        try {
          assertReminderCanBeSet({
            spec,
            enabled: input.enabled,
            task,
            now,
            allowDormantDisable:
              current !== null && !input.enabled && sameReminderSpec(storedReminderPolicySpec(current), spec),
          });
        } catch (error) {
          throw notificationValidationFailed(
            error instanceof Error ? error.message : "This task cannot use that reminder.",
          );
        }

        const saved = current
          ? await replaceReminder(actor.userId, current, input, now, transaction)
          : await insertReminder(actor.userId, input, now, transaction);
        await dependencies.reconciler.reconcileOne(actor, input.taskId, "schedule_changed", transaction);
        return mapTaskReminder(saved);
      });
    },

    async removeTaskReminder(
      actor: AuthenticatedActor,
      rawInput: RemoveTaskReminderInput,
    ): Promise<TaskReminderDto | null> {
      const input = removeTaskReminderInputSchema.parse(rawInput);
      return dependencies.database.transaction(async (transaction) => {
        const task = await dependencies.tasks.readOwned(
          actor,
          { taskId: input.taskId, relativeStartAfter: dependencies.clock.now(), lock: true },
          transaction,
        );
        if (!task) throw notificationNotFound();
        const current = await dependencies.reminders.findByTask(
          actor.userId,
          input.taskId,
          transaction,
          true,
        );
        if (!current) return null;
        if (current.version !== input.expectedVersion) throw staleNotification(current.version);
        const removed = await dependencies.reminders.remove(
          actor.userId,
          input.taskId,
          input.expectedVersion,
          transaction,
        );
        if (!removed) throw staleNotification(current.version);
        return mapTaskReminder(removed);
      });
    },
  } as const;

  function resolveSetReplay(
    current: TaskReminderRecord | null,
    input: SetTaskReminderInput,
  ): TaskReminderRecord | null {
    if (!current) {
      if (input.expectedVersion !== null) throw notificationNotFound();
      return null;
    }
    if (input.expectedVersion === null) {
      if (sameStoredInput(current, input)) return current;
      throw notificationConflict("This task already has a reminder.", current.version);
    }
    if (current.id !== input.id) {
      throw notificationConflict("A reminder identifier cannot be replaced.", current.version);
    }
    if (current.version === input.expectedVersion + 1 && sameStoredInput(current, input)) {
      return current;
    }
    if (current.version !== input.expectedVersion) throw staleNotification(current.version);
    return sameStoredInput(current, input) ? current : null;
  }

  async function insertReminder(
    userId: string,
    input: SetTaskReminderInput,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<TaskReminderRecord> {
    const spec = toReminderPolicySpec(input.spec);
    const inserted = await dependencies.reminders.insert(
      {
        id: input.id,
        userId,
        taskId: input.taskId,
        kind: spec.kind,
        remindAt: spec.kind === "absolute" ? spec.remindAt : null,
        offsetMinutes: spec.kind === "relative_start" ? spec.offsetMinutes : null,
        enabled: input.enabled,
        now,
      },
      executor,
    );
    if (!inserted) throw notificationConflict("This reminder identifier could not be reserved safely.");
    return inserted;
  }

  async function replaceReminder(
    userId: string,
    current: TaskReminderRecord,
    input: SetTaskReminderInput,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<TaskReminderRecord> {
    if (input.expectedVersion === null) throw new Error("A replacement requires a reminder version.");
    const spec = toReminderPolicySpec(input.spec);
    const replaced = await dependencies.reminders.replace(
      {
        userId,
        taskId: input.taskId,
        expectedVersion: input.expectedVersion,
        kind: spec.kind,
        remindAt: spec.kind === "absolute" ? spec.remindAt : null,
        offsetMinutes: spec.kind === "relative_start" ? spec.offsetMinutes : null,
        enabled: input.enabled,
        now,
      },
      executor,
    );
    if (!replaced) throw staleNotification(current.version);
    return replaced;
  }
}

function sameStoredInput(record: TaskReminderRecord, input: SetTaskReminderInput): boolean {
  return (
    record.id === input.id &&
    record.enabled === input.enabled &&
    sameReminderSpec(storedReminderPolicySpec(record), toReminderPolicySpec(input.spec))
  );
}
