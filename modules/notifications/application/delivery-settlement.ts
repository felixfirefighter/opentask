import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { notificationCleanupAt, scheduleTargetMaintenance } from "./maintenance-scheduling";
import type {
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushProviderResult,
  PushSubscriptionRepository,
} from "./notification-ports";
import type { NotificationDeliveryRecord, PushSubscriptionRecord } from "./notification-records";
import { NOTIFICATION_ATTEMPT_MAX } from "../domain/notification-limits";

export type DeliverNotificationResult =
  Readonly<{ outcome: "completed" | "noop" }> | Readonly<{ outcome: "retry" }>;

type TerminalCode =
  "subscription_material_invalid" | "outcome_unknown" | "retry_exhausted" | "provider_permanent" | null;

export function createDeliverySettlement(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    subscriptions: PushSubscriptionRepository;
    deliveries: NotificationDeliveryRepository;
    scheduler: NotificationJobScheduler;
  }>,
) {
  async function settleProviderResult(
    delivery: NotificationDeliveryRecord,
    subscription: PushSubscriptionRecord,
    result: PushProviderResult,
  ): Promise<DeliverNotificationResult> {
    if (result.kind === "accepted") {
      await settleTerminal(delivery, "delivered", null);
      return { outcome: "completed" };
    }
    if (result.kind === "retryable" && delivery.attemptCount < NOTIFICATION_ATTEMPT_MAX) {
      const retried = await writeRetry(delivery);
      return { outcome: retried ? "retry" : "noop" };
    }
    if (result.kind === "subscription_gone") {
      await settleGoneSubscription(delivery, subscription);
      return { outcome: "completed" };
    }
    const code =
      result.kind === "outcome_unknown"
        ? "outcome_unknown"
        : result.kind === "retryable"
          ? "retry_exhausted"
          : "provider_permanent";
    await settleTerminal(delivery, "failed", code);
    return { outcome: "completed" };
  }

  async function settleTerminal(
    delivery: NotificationDeliveryRecord,
    state: "delivered" | "failed",
    code: TerminalCode,
  ): Promise<void> {
    await dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      const current = await dependencies.deliveries.findById(delivery.userId, delivery.id, transaction, true);
      if (!sameClaim(current, delivery)) return;
      const written = await dependencies.deliveries.writeState(
        {
          userId: delivery.userId,
          id: delivery.id,
          expectedState: "delivering",
          expectedAttemptCount: delivery.attemptCount,
          state,
          attemptCount: delivery.attemptCount,
          lastErrorCode: code,
          deliveredAt: state === "delivered" ? now : null,
          now,
        },
        transaction,
      );
      if (written) await scheduleTerminalJobs(written, now, transaction);
    });
  }

  async function writeRetry(delivery: NotificationDeliveryRecord): Promise<boolean> {
    return dependencies.database.transaction(async (transaction) => {
      const written = await dependencies.deliveries.writeState(
        {
          userId: delivery.userId,
          id: delivery.id,
          expectedState: "delivering",
          expectedAttemptCount: delivery.attemptCount,
          state: "retry_scheduled",
          attemptCount: delivery.attemptCount,
          lastErrorCode: "provider_retryable",
          deliveredAt: null,
          now: dependencies.clock.now(),
        },
        transaction,
      );
      return written !== null;
    });
  }

  async function settleGoneSubscription(
    delivery: NotificationDeliveryRecord,
    subscription: PushSubscriptionRecord,
  ): Promise<void> {
    await dependencies.database.transaction(async (transaction) => {
      const now = dependencies.clock.now();
      const currentSubscription = await dependencies.subscriptions.findById(
        delivery.userId,
        subscription.id,
        transaction,
        true,
      );
      const current = await dependencies.deliveries.findById(delivery.userId, delivery.id, transaction, true);
      if (!sameClaim(current, delivery)) return;
      if (currentSubscription?.revokedAt === null) {
        await dependencies.subscriptions.revoke(delivery.userId, subscription.id, now, transaction);
      }
      const failed = await dependencies.deliveries.writeState(
        {
          userId: delivery.userId,
          id: delivery.id,
          expectedState: "delivering",
          expectedAttemptCount: delivery.attemptCount,
          state: "failed",
          attemptCount: delivery.attemptCount,
          lastErrorCode: "subscription_gone",
          deliveredAt: null,
          now,
        },
        transaction,
      );
      if (failed) await scheduleTerminalJobs(failed, now, transaction);
      if (currentSubscription) {
        await scheduleTargetMaintenance(
          dependencies.scheduler,
          {
            schemaVersion: 1,
            userId: delivery.userId,
            kind: "subscription_cleanup",
            subscriptionId: subscription.id,
          },
          notificationCleanupAt(now),
          transaction,
        );
      }
    });
  }

  async function scheduleTerminalJobs(
    delivery: NotificationDeliveryRecord,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<void> {
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

  return { settleProviderResult, settleTerminal } as const;
}

function sameClaim(
  current: NotificationDeliveryRecord | null,
  expected: NotificationDeliveryRecord,
): current is NotificationDeliveryRecord {
  return current !== null && current.state === "delivering" && current.attemptCount === expected.attemptCount;
}
