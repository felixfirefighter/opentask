import type { DatabaseExecutor } from "@/shared/db/client";

import type {
  NotificationDigest,
  NotificationDeliveryRepository,
  NotificationIdGenerator,
  NotificationJobScheduler,
} from "./notification-ports";
import type { NotificationDeliveryRecord, TaskReminderRecord } from "./notification-records";
import { notificationCleanupAt, scheduleTargetMaintenance } from "./maintenance-scheduling";
import { canReactivateSuppressedDelivery, isTerminalDeliveryState } from "../domain/delivery-policy";
import { deliveryIdempotencyCanonicalValue } from "../domain/delivery-idempotency";
import type { ReminderSuppressionCode, ReminderTargetDecision } from "../domain/reminder-policy";

export async function reconcileDesiredDeliveries(
  input: Readonly<{
    userId: string;
    reminder: TaskReminderRecord;
    subscriptionIds: readonly string[];
    current: readonly NotificationDeliveryRecord[];
    target: ReminderTargetDecision;
    reason: ReminderSuppressionCode;
    now: Date;
    executor: DatabaseExecutor;
    deliveries: NotificationDeliveryRepository;
    digest: NotificationDigest;
    ids: NotificationIdGenerator;
    scheduler: NotificationJobScheduler;
  }>,
): Promise<void> {
  await suppressObsoleteDeliveries(input);
  if (input.target.kind === "dormant") return;
  for (const subscriptionId of input.subscriptionIds) {
    await ensureTargetDelivery({ ...input, subscriptionId, target: input.target });
  }
}

async function suppressObsoleteDeliveries(
  input: Readonly<{
    userId: string;
    subscriptionIds: readonly string[];
    current: readonly NotificationDeliveryRecord[];
    target: ReminderTargetDecision;
    reason: ReminderSuppressionCode;
    now: Date;
    executor: DatabaseExecutor;
    deliveries: NotificationDeliveryRepository;
    scheduler: NotificationJobScheduler;
  }>,
): Promise<void> {
  const activeIds = new Set(input.subscriptionIds);
  for (const delivery of input.current) {
    if (isTerminalDeliveryState(delivery.state)) continue;
    const matchesTarget =
      input.target.kind === "eligible" &&
      delivery.scheduledFor.getTime() === input.target.scheduledFor.getTime() &&
      delivery.occurrenceKey === input.target.occurrenceKey &&
      activeIds.has(delivery.subscriptionId);
    if (matchesTarget) continue;
    const code = activeIds.has(delivery.subscriptionId) ? input.reason : "subscription_revoked";
    const suppressed = await input.deliveries.writeState(
      {
        userId: input.userId,
        id: delivery.id,
        expectedState: delivery.state,
        expectedAttemptCount: delivery.attemptCount,
        state: "suppressed",
        attemptCount: delivery.attemptCount,
        lastErrorCode: code,
        deliveredAt: null,
        now: input.now,
      },
      input.executor,
    );
    if (suppressed) {
      await scheduleTargetMaintenance(
        input.scheduler,
        {
          schemaVersion: 1,
          userId: input.userId,
          kind: "delivery_cleanup",
          deliveryId: suppressed.id,
        },
        notificationCleanupAt(input.now),
        input.executor,
      );
    }
  }
}

async function ensureTargetDelivery(
  input: Readonly<{
    userId: string;
    reminder: TaskReminderRecord;
    subscriptionId: string;
    current: readonly NotificationDeliveryRecord[];
    target: Extract<ReminderTargetDecision, { kind: "eligible" }>;
    now: Date;
    executor: DatabaseExecutor;
    deliveries: NotificationDeliveryRepository;
    digest: NotificationDigest;
    ids: NotificationIdGenerator;
    scheduler: NotificationJobScheduler;
  }>,
): Promise<void> {
  const idempotencyKey = input.digest.sha256Hex(
    deliveryIdempotencyCanonicalValue({
      userId: input.userId,
      reminderId: input.reminder.id,
      reminderVersion: input.reminder.version,
      subscriptionId: input.subscriptionId,
      occurrenceKey: input.target.occurrenceKey,
      scheduledFor: input.target.scheduledFor,
    }),
  );
  const existing = input.current.find((delivery) => delivery.idempotencyKey === idempotencyKey);
  if (existing) {
    if (
      canReactivateSuppressedDelivery({
        state: existing.state,
        attemptCount: existing.attemptCount,
        errorCode: existing.lastErrorCode,
        scheduledFor: existing.scheduledFor,
        now: input.now,
      })
    ) {
      await input.deliveries.writeState(
        {
          userId: input.userId,
          id: existing.id,
          expectedState: "suppressed",
          expectedAttemptCount: 0,
          state: "scheduled",
          attemptCount: 0,
          lastErrorCode: null,
          deliveredAt: null,
          now: input.now,
        },
        input.executor,
      );
    }
    return;
  }

  const inserted = await input.deliveries.insertIfAbsent(
    {
      id: input.ids.next(),
      userId: input.userId,
      reminderId: input.reminder.id,
      subscriptionId: input.subscriptionId,
      occurrenceKey: input.target.occurrenceKey,
      scheduledFor: input.target.scheduledFor,
      idempotencyKey,
      now: input.now,
    },
    input.executor,
  );
  if (!inserted.inserted) return;
  await input.scheduler.sendDelivery(
    { schemaVersion: 1, userId: input.userId, deliveryId: inserted.delivery.id },
    { jobId: inserted.delivery.id, startAfter: input.target.scheduledFor },
    input.executor,
  );
}
