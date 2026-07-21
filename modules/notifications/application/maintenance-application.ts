import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { notificationMaintenanceJobSchema, type NotificationMaintenanceJob } from "./contracts";
import {
  addNotificationSeconds,
  notificationCleanupEligibleAt,
  scheduleTargetMaintenance,
} from "./maintenance-scheduling";
import type {
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushSubscriptionRepository,
  TaskReminderRepository,
} from "./notification-ports";
import type { NotificationReconciler } from "./notification-reconciler";
import type {
  NotificationDeliveryRecord,
  NotificationRecoveryResource,
  PushSubscriptionRecord,
} from "./notification-records";
import {
  isNotificationStale,
  isTerminalDeliveryState,
  notificationLeaseExpiresAt,
} from "../domain/delivery-policy";
import { NOTIFICATION_RECOVERY_PAGE_SIZE } from "../domain/notification-limits";

export function createMaintenanceApplication(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    reminders: TaskReminderRepository;
    subscriptions: PushSubscriptionRepository;
    deliveries: NotificationDeliveryRepository;
    scheduler: NotificationJobScheduler;
    reconciler: NotificationReconciler;
  }>,
) {
  return {
    async runNotificationMaintenance(rawJob: NotificationMaintenanceJob): Promise<void> {
      const job = notificationMaintenanceJobSchema.parse(rawJob);
      await dependencies.reconciler.ensureProducer();
      if (job.kind === "delivery_lease") return handleDeliveryLease(job);
      if (job.kind === "delivery_cleanup") return handleDeliveryCleanup(job);
      if (job.kind === "subscription_cleanup") return handleSubscriptionCleanup(job);
      if (job.kind === "recurring_repair") return handleRecurringRepair(job);
      return handleActorRecovery(job);
    },
  } as const;

  async function handleDeliveryLease(
    job: Extract<NotificationMaintenanceJob, { kind: "delivery_lease" }>,
  ): Promise<void> {
    await dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      const delivery = await dependencies.deliveries.findById(job.userId, job.deliveryId, transaction, true);
      if (!delivery || delivery.state !== "delivering") return;
      const leaseAt = notificationLeaseExpiresAt(delivery.updatedAt);
      if (now.getTime() < leaseAt.getTime()) {
        await scheduleTargetMaintenance(dependencies.scheduler, job, leaseAt, transaction);
        return;
      }
      const failed = await dependencies.deliveries.writeState(
        {
          userId: job.userId,
          id: delivery.id,
          expectedState: "delivering",
          expectedAttemptCount: delivery.attemptCount,
          state: "failed",
          attemptCount: delivery.attemptCount,
          lastErrorCode: "outcome_unknown",
          deliveredAt: null,
          now,
        },
        transaction,
      );
      if (failed) await scheduleTerminalTargets(failed, now, transaction);
    });
  }

  async function handleDeliveryCleanup(
    job: Extract<NotificationMaintenanceJob, { kind: "delivery_cleanup" }>,
  ): Promise<void> {
    await dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      const delivery = await dependencies.deliveries.findById(job.userId, job.deliveryId, transaction, true);
      if (!delivery || !isTerminalDeliveryState(delivery.state)) return;
      const eligibleAt = notificationCleanupEligibleAt(delivery.updatedAt);
      if (now.getTime() < eligibleAt.getTime()) {
        await scheduleTargetMaintenance(dependencies.scheduler, job, eligibleAt, transaction);
        return;
      }
      await dependencies.deliveries.removeTerminal(job.userId, job.deliveryId, now, transaction);
    });
  }

  async function handleSubscriptionCleanup(
    job: Extract<NotificationMaintenanceJob, { kind: "subscription_cleanup" }>,
  ): Promise<void> {
    await dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      const subscription = await dependencies.subscriptions.findById(
        job.userId,
        job.subscriptionId,
        transaction,
        true,
      );
      if (!subscription?.revokedAt) return;
      const eligibleAt = notificationCleanupEligibleAt(subscription.revokedAt);
      if (now.getTime() < eligibleAt.getTime()) {
        await scheduleTargetMaintenance(dependencies.scheduler, job, eligibleAt, transaction);
        return;
      }
      if (await dependencies.deliveries.hasForSubscription(job.userId, job.subscriptionId, transaction)) {
        await scheduleTargetMaintenance(
          dependencies.scheduler,
          job,
          addNotificationSeconds(now, 24 * 60 * 60),
          transaction,
        );
        return;
      }
      await dependencies.subscriptions.removeRevoked(job.userId, job.subscriptionId, now, transaction);
    });
  }

  async function handleRecurringRepair(
    job: Extract<NotificationMaintenanceJob, { kind: "recurring_repair" }>,
  ): Promise<void> {
    const reminder = await dependencies.reminders.findById(job.userId, job.reminderId, dependencies.database);
    if (!reminder) return;
    await dependencies.database.transaction((transaction) =>
      dependencies.reconciler.reconcileOne(
        { userId: job.userId },
        reminder.taskId,
        "occurrence_terminal",
        transaction,
      ),
    );
  }

  async function handleActorRecovery(
    job: Extract<NotificationMaintenanceJob, { kind: "actor_recovery" }>,
  ): Promise<void> {
    const resource = job.after?.resource ?? "deliveries";
    const afterId = job.after?.id ?? null;
    const next =
      resource === "deliveries"
        ? await recoverDeliveries(job.userId, afterId)
        : resource === "subscriptions"
          ? await recoverSubscriptions(job.userId, afterId)
          : await recoverReminders(job.userId, afterId);
    if (!next) return;
    await dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      await dependencies.scheduler.sendMaintenance(
        { schemaVersion: 1, userId: job.userId, kind: "actor_recovery", after: next },
        {
          startAfter: now,
          dedupeKey: `notification-actor-recovery:${job.userId}:${next.resource}:${next.id}:${now.toISOString()}`,
        },
        transaction,
      );
    });
  }

  async function recoverDeliveries(
    userId: string,
    afterId: string | null,
  ): Promise<{ resource: NotificationRecoveryResource; id: string } | null> {
    const page = await dependencies.deliveries.listRecoveryPage(
      userId,
      afterId,
      NOTIFICATION_RECOVERY_PAGE_SIZE,
      dependencies.database,
    );
    for (const delivery of page) await recoverDelivery(userId, delivery);
    if (page.length === NOTIFICATION_RECOVERY_PAGE_SIZE) {
      return { resource: "deliveries", id: page.at(-1)!.id };
    }
    return { resource: "subscriptions", id: zeroCursor() };
  }

  async function recoverDelivery(userId: string, delivery: NotificationDeliveryRecord): Promise<void> {
    await dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      if (delivery.state === "delivering") {
        await scheduleTargetMaintenance(
          dependencies.scheduler,
          { schemaVersion: 1, userId, kind: "delivery_lease", deliveryId: delivery.id },
          notificationLeaseExpiresAt(delivery.updatedAt),
          transaction,
        );
      } else if (isTerminalDeliveryState(delivery.state)) {
        await scheduleTargetMaintenance(
          dependencies.scheduler,
          { schemaVersion: 1, userId, kind: "delivery_cleanup", deliveryId: delivery.id },
          notificationCleanupEligibleAt(delivery.updatedAt),
          transaction,
        );
      } else {
        await dependencies.scheduler.sendDelivery(
          { schemaVersion: 1, userId, deliveryId: delivery.id },
          {
            jobId: delivery.id,
            startAfter: isNotificationStale(delivery.scheduledFor, now) ? now : delivery.scheduledFor,
          },
          transaction,
        );
      }
    });
  }

  async function recoverSubscriptions(
    userId: string,
    afterId: string | null,
  ): Promise<{ resource: NotificationRecoveryResource; id: string } | null> {
    const normalizedAfter = afterId === zeroCursor() ? null : afterId;
    const page = await dependencies.subscriptions.listRecoveryPage(
      userId,
      normalizedAfter,
      NOTIFICATION_RECOVERY_PAGE_SIZE,
      dependencies.database,
    );
    for (const subscription of page) {
      if (subscription.revokedAt) await recoverSubscription(userId, subscription);
    }
    if (page.length === NOTIFICATION_RECOVERY_PAGE_SIZE) {
      return { resource: "subscriptions", id: page.at(-1)!.id };
    }
    return { resource: "reminders", id: zeroCursor() };
  }

  async function recoverSubscription(userId: string, subscription: PushSubscriptionRecord): Promise<void> {
    await dependencies.database.transaction((transaction) =>
      scheduleTargetMaintenance(
        dependencies.scheduler,
        { schemaVersion: 1, userId, kind: "subscription_cleanup", subscriptionId: subscription.id },
        notificationCleanupEligibleAt(subscription.revokedAt!),
        transaction,
      ),
    );
  }

  async function recoverReminders(userId: string, afterId: string | null) {
    const normalizedAfter = afterId === zeroCursor() ? null : afterId;
    const page = await dependencies.reminders.listRecoveryPage(
      userId,
      normalizedAfter,
      NOTIFICATION_RECOVERY_PAGE_SIZE,
      dependencies.database,
    );
    for (const reminder of page) {
      await dependencies.database.transaction((transaction) =>
        dependencies.reconciler.reconcileOne({ userId }, reminder.taskId, "schedule_changed", transaction),
      );
    }
    return page.length === NOTIFICATION_RECOVERY_PAGE_SIZE
      ? { resource: "reminders" as const, id: page.at(-1)!.id }
      : null;
  }

  async function scheduleTerminalTargets(
    delivery: NotificationDeliveryRecord,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<void> {
    await scheduleTargetMaintenance(
      dependencies.scheduler,
      { schemaVersion: 1, userId: delivery.userId, kind: "delivery_cleanup", deliveryId: delivery.id },
      notificationCleanupEligibleAt(now),
      executor,
    );
    await scheduleTargetMaintenance(
      dependencies.scheduler,
      {
        schemaVersion: 1,
        userId: delivery.userId,
        kind: "recurring_repair",
        reminderId: delivery.reminderId,
      },
      now,
      executor,
    );
  }
}

function zeroCursor(): string {
  return "00000000-0000-4000-8000-000000000000";
}
