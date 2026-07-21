import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type {
  ApplyTaskRecurrenceReminderResolution,
  ReminderRelevantTaskChange,
  ReminderRelevantTaskChangeReason,
  TaskRecurrenceReminderResolution,
  TaskReminderReconciler,
  TaskReminderSource,
  TaskReminderSourceReader,
} from "@/modules/tasks";
import { normalizeReminderTaskIds, ReminderProducerPreparationRequiredError } from "@/modules/tasks";
import type { Clock } from "@/shared/time/clock";

import type {
  NotificationDigest,
  NotificationIdGenerator,
  NotificationJobScheduler,
  NotificationDeliveryRepository,
  PushSubscriptionRepository,
  TaskReminderRepository,
} from "./notification-ports";
import type { TaskReminderRecord } from "./notification-records";
import { notificationConflict, notificationValidationFailed, staleNotification } from "./notification-errors";
import { storedReminderPolicySpec } from "./notification-mapper";
import { reconcileDesiredDeliveries } from "./reconciliation-deliveries";
import {
  assertReminderCanBeSet,
  reminderRelativeStartThreshold,
  resolveReminderTarget,
} from "../domain/reminder-policy";

export type NotificationReconciler = TaskReminderReconciler & {
  ensureProducer(): Promise<void>;
  reconcileOne(
    actor: AuthenticatedActor,
    taskId: string,
    reason: ReminderRelevantTaskChangeReason,
    executor: DatabaseExecutor,
  ): Promise<void>;
};

export function createNotificationReconciler(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    tasks: TaskReminderSourceReader;
    reminders: TaskReminderRepository;
    subscriptions: PushSubscriptionRepository;
    deliveries: NotificationDeliveryRepository;
    scheduler: NotificationJobScheduler;
    digest: NotificationDigest;
    ids: NotificationIdGenerator;
  }>,
): NotificationReconciler {
  let producerReady = false;

  async function ensureProducer(): Promise<void> {
    if (producerReady) return;
    await dependencies.scheduler.ensureQueues();
    producerReady = true;
  }

  async function prepare(actor: AuthenticatedActor, rawTaskIds: readonly string[]): Promise<void> {
    if (producerReady) return;
    const taskIds = normalizeReminderTaskIds(rawTaskIds);
    for (const taskId of taskIds) {
      const reminder = await dependencies.reminders.findByTask(actor.userId, taskId, dependencies.database);
      if (reminder) {
        await ensureProducer();
        return;
      }
    }
  }

  async function reconcile(
    actor: AuthenticatedActor,
    change: ReminderRelevantTaskChange,
    executor: DatabaseExecutor,
  ): Promise<void> {
    const taskIds = normalizeReminderTaskIds(change.taskIds);
    for (const taskId of taskIds) {
      await reconcileOne(actor, taskId, change.reason, executor);
    }
  }

  async function reconcileOne(
    actor: AuthenticatedActor,
    taskId: string,
    reason: ReminderRelevantTaskChangeReason,
    executor: DatabaseExecutor,
  ): Promise<void> {
    const now = dependencies.clock.now();
    const initialSource = await dependencies.tasks.readOwned(
      actor,
      { taskId, relativeStartAfter: now, lock: true },
      executor,
    );
    if (!initialSource) return;

    const reminder = await dependencies.reminders.findByTask(actor.userId, taskId, executor, true);
    if (!reminder) return;
    if (!producerReady) throw new ReminderProducerPreparationRequiredError([taskId]);

    const source = await sourceForReminder(actor, initialSource, reminder, now, executor);
    const subscriptions = await dependencies.subscriptions.listActive(actor.userId, executor, true);
    const currentDeliveries = await dependencies.deliveries.listByReminder(
      actor.userId,
      reminder.id,
      executor,
      true,
    );
    const target = resolveReminderTarget({
      spec: storedReminderPolicySpec(reminder),
      enabled: reminder.enabled,
      task: source,
      now,
    });

    await reconcileDesiredDeliveries({
      userId: actor.userId,
      reminder,
      subscriptionIds: subscriptions.map((subscription) => subscription.id),
      current: currentDeliveries,
      target,
      reason: target.kind === "dormant" ? target.code : reason,
      now,
      executor,
      deliveries: dependencies.deliveries,
      digest: dependencies.digest,
      ids: dependencies.ids,
      scheduler: dependencies.scheduler,
    });
  }

  async function applyRecurrenceResolution(
    actor: AuthenticatedActor,
    input: ApplyTaskRecurrenceReminderResolution,
    executor: DatabaseExecutor,
  ): Promise<void> {
    const reminder = await dependencies.reminders.findByTask(actor.userId, input.taskId, executor, true);
    if (!reminder) {
      if (input.resolution !== null) {
        throw notificationConflict("This task no longer has the reminder being resolved.");
      }
      return;
    }
    if (reminder.kind !== "absolute") {
      if (input.resolution !== null) {
        throw notificationConflict(
          "This task reminder no longer needs recurrence conversion.",
          reminder.version,
        );
      }
      return;
    }
    if (input.resolution === null) {
      throw notificationConflict(
        "Choose whether to remove or convert the absolute reminder before adding recurrence.",
        reminder.version,
      );
    }
    if (input.resolution.expectedReminderVersion !== reminder.version) {
      throw staleNotification(reminder.version);
    }

    await applyResolution(actor, reminder, input.resolution, dependencies.clock.now(), executor);
  }

  return { ensureProducer, prepare, reconcile, reconcileOne, applyRecurrenceResolution };

  async function sourceForReminder(
    actor: AuthenticatedActor,
    initial: TaskReminderSource,
    reminder: TaskReminderRecord,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<TaskReminderSource> {
    if (reminder.kind !== "relative_start") return initial;
    const threshold = reminderRelativeStartThreshold(storedReminderPolicySpec(reminder), now);
    return (
      (await dependencies.tasks.readOwned(
        actor,
        { taskId: reminder.taskId, relativeStartAfter: threshold, lock: false },
        executor,
      )) ?? initial
    );
  }

  async function applyResolution(
    actor: AuthenticatedActor,
    reminder: TaskReminderRecord,
    resolution: TaskRecurrenceReminderResolution,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<void> {
    if (resolution.kind === "remove") {
      const removed = await dependencies.reminders.remove(
        actor.userId,
        reminder.taskId,
        resolution.expectedReminderVersion,
        executor,
      );
      if (!removed) throw staleNotification(reminder.version);
      return;
    }
    const convertedSpec = {
      kind: "relative_start" as const,
      remindAt: null,
      offsetMinutes: resolution.offsetMinutes,
    };
    const source = await dependencies.tasks.readOwned(
      actor,
      {
        taskId: reminder.taskId,
        relativeStartAfter: reminderRelativeStartThreshold(convertedSpec, now),
        lock: false,
      },
      executor,
    );
    if (!source) throw notificationConflict("The task changed while its reminder was being converted.");
    try {
      assertReminderCanBeSet({
        spec: convertedSpec,
        enabled: reminder.enabled,
        task: source,
        now,
        allowDormantDisable: !reminder.enabled,
      });
    } catch (error) {
      throw notificationValidationFailed(
        error instanceof Error ? error.message : "The reminder conversion is not eligible.",
      );
    }
    const replaced = await dependencies.reminders.replace(
      {
        userId: actor.userId,
        taskId: reminder.taskId,
        expectedVersion: resolution.expectedReminderVersion,
        kind: "relative_start",
        remindAt: null,
        offsetMinutes: resolution.offsetMinutes,
        enabled: reminder.enabled,
        now,
      },
      executor,
    );
    if (!replaced) throw staleNotification(reminder.version);
  }
}
