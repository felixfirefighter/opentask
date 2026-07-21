import type { Database } from "@/shared/db/client";
import type { TaskReminderSourceReader } from "@/modules/tasks";
import type { Clock } from "@/shared/time/clock";

import { notificationDeliveryJobSchema, type NotificationDeliveryJob } from "./contracts";
import { createDeliverySettlement, type DeliverNotificationResult } from "./delivery-settlement";
import { validateCurrentDelivery } from "./delivery-validation";
import { storedReminderPolicySpec } from "./notification-mapper";
import { notificationCleanupAt, scheduleTargetMaintenance } from "./maintenance-scheduling";
import type {
  NotificationDigest,
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushProvider,
  PushProviderResult,
  PushSubscriptionRepository,
  SubscriptionCipher,
  TaskReminderRepository,
} from "./notification-ports";
import type { NotificationDeliveryRecord, PushSubscriptionRecord } from "./notification-records";
import {
  canClaimNotification,
  isNotificationStale,
  notificationLeaseExpiresAt,
  notificationPushTtlSeconds,
} from "../domain/delivery-policy";
import { NOTIFICATION_PROVIDER_TIMEOUT_MS } from "../domain/notification-limits";

type ClaimedDelivery = Readonly<{
  delivery: NotificationDeliveryRecord;
  subscription: PushSubscriptionRecord;
  taskId: string;
  ttlSeconds: number;
}>;

export function createDeliveryApplication(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    tasks: TaskReminderSourceReader;
    reminders: TaskReminderRepository;
    subscriptions: PushSubscriptionRepository;
    deliveries: NotificationDeliveryRepository;
    cipher: SubscriptionCipher;
    digest: NotificationDigest;
    scheduler: NotificationJobScheduler;
    provider: PushProvider;
  }>,
) {
  const settlement = createDeliverySettlement(dependencies);
  return {
    async deliverNotification(rawJob: NotificationDeliveryJob): Promise<DeliverNotificationResult> {
      const job = notificationDeliveryJobSchema.parse(rawJob);
      await dependencies.scheduler.ensureQueues();
      const claimed = await claimDelivery(job);
      if (!claimed) return { outcome: "noop" };

      let material: { endpoint: string; p256dh: string; auth: string };
      try {
        material = decryptSubscription(dependencies.cipher, claimed.subscription);
      } catch {
        await settlement.settleTerminal(claimed.delivery, "failed", "subscription_material_invalid");
        return { outcome: "completed" };
      }

      const result: PushProviderResult = dependencies.provider.configured
        ? await dependencies.provider.send({
            ...material,
            payload: { schemaVersion: 1, taskId: claimed.taskId, deliveryId: claimed.delivery.id },
            ttlSeconds: claimed.ttlSeconds,
            timeoutMs: NOTIFICATION_PROVIDER_TIMEOUT_MS,
          })
        : { kind: "permanent", code: "provider_unconfigured" };
      return settlement.settleProviderResult(claimed.delivery, claimed.subscription, result);
    },
  } as const;

  async function claimDelivery(job: NotificationDeliveryJob): Promise<ClaimedDelivery | null> {
    const preflight = await dependencies.deliveries.findById(
      job.userId,
      job.deliveryId,
      dependencies.database,
    );
    if (!preflight) return null;
    const preflightReminder = await dependencies.reminders.findById(
      job.userId,
      preflight.reminderId,
      dependencies.database,
    );
    if (!preflightReminder) return null;

    return dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      const preflightSpec = storedReminderPolicySpec(preflightReminder);
      const relativeStartAfter =
        preflightSpec.kind === "relative_start"
          ? new Date(preflight.scheduledFor.getTime() + preflightSpec.offsetMinutes * 60_000 - 1)
          : new Date(preflight.scheduledFor.getTime() - 1);
      const task = await dependencies.tasks.readOwned(
        { userId: job.userId },
        { taskId: preflightReminder.taskId, relativeStartAfter, lock: true },
        transaction,
      );
      const reminder = await dependencies.reminders.findById(
        job.userId,
        preflight.reminderId,
        transaction,
        true,
      );
      if (!reminder) return null;
      const subscription = await dependencies.subscriptions.findById(
        job.userId,
        preflight.subscriptionId,
        transaction,
        true,
      );
      const delivery = await dependencies.deliveries.findById(job.userId, job.deliveryId, transaction, true);
      if (!subscription || !delivery || !canClaimNotification(delivery.state, delivery.attemptCount))
        return null;
      if (!task) {
        await suppress(delivery, "task_deleted", now, transaction);
        return null;
      }

      if (isNotificationStale(delivery.scheduledFor, now)) {
        await suppress(delivery, "stale", now, transaction);
        return null;
      }
      const validation = validateCurrentDelivery({
        delivery,
        reminder,
        subscription,
        task,
        digest: dependencies.digest,
      });
      if (validation.kind === "suppress") {
        await suppress(delivery, validation.code, now, transaction);
        return null;
      }

      const attemptCount = delivery.attemptCount + 1;
      const claimed = await dependencies.deliveries.writeState(
        {
          userId: job.userId,
          id: delivery.id,
          expectedState: delivery.state,
          expectedAttemptCount: delivery.attemptCount,
          state: "delivering",
          attemptCount,
          lastErrorCode: null,
          deliveredAt: null,
          now,
        },
        transaction,
      );
      if (!claimed) return null;
      await scheduleTargetMaintenance(
        dependencies.scheduler,
        { schemaVersion: 1, userId: job.userId, kind: "delivery_lease", deliveryId: delivery.id },
        notificationLeaseExpiresAt(now),
        transaction,
      );
      return {
        delivery: claimed,
        subscription,
        taskId: validation.taskId,
        ttlSeconds: notificationPushTtlSeconds(delivery.scheduledFor, now),
      };
    });
  }

  async function suppress(
    delivery: NotificationDeliveryRecord,
    code: Parameters<typeof dependencies.deliveries.writeState>[0]["lastErrorCode"],
    now: Date,
    executor: Parameters<typeof dependencies.deliveries.writeState>[1],
  ): Promise<void> {
    const suppressed = await dependencies.deliveries.writeState(
      {
        userId: delivery.userId,
        id: delivery.id,
        expectedState: delivery.state,
        expectedAttemptCount: delivery.attemptCount,
        state: "suppressed",
        attemptCount: delivery.attemptCount,
        lastErrorCode: code,
        deliveredAt: null,
        now,
      },
      executor,
    );
    if (!suppressed) return;
    await scheduleTargetMaintenance(
      dependencies.scheduler,
      { schemaVersion: 1, userId: delivery.userId, kind: "delivery_cleanup", deliveryId: delivery.id },
      notificationCleanupAt(now),
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

function decryptSubscription(cipher: SubscriptionCipher, subscription: PushSubscriptionRecord) {
  const common = {
    userId: subscription.userId,
    subscriptionId: subscription.id,
    keyVersion: subscription.encryptionKeyVersion,
  } as const;
  return {
    endpoint: cipher.decrypt({ ...common, field: "endpoint", ciphertext: subscription.endpointCiphertext }),
    p256dh: cipher.decrypt({ ...common, field: "p256dh", ciphertext: subscription.p256dhCiphertext }),
    auth: cipher.decrypt({ ...common, field: "auth", ciphertext: subscription.authCiphertext }),
  };
}
