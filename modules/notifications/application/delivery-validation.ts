import type { TaskReminderSource } from "@/modules/tasks";

import type { NotificationDigest } from "./notification-ports";
import type {
  NotificationDeliveryRecord,
  PushSubscriptionRecord,
  TaskReminderRecord,
} from "./notification-records";
import { storedReminderPolicySpec } from "./notification-mapper";
import { deliveryIdempotencyCanonicalValue } from "../domain/delivery-idempotency";
import { resolveReminderTarget, type ReminderSuppressionCode } from "../domain/reminder-policy";

export type DeliveryValidationResult =
  Readonly<{ kind: "valid"; taskId: string }> | Readonly<{ kind: "suppress"; code: ReminderSuppressionCode }>;

export function validateCurrentDelivery(
  input: Readonly<{
    delivery: NotificationDeliveryRecord;
    reminder: TaskReminderRecord;
    subscription: PushSubscriptionRecord;
    task: TaskReminderSource;
    digest: NotificationDigest;
  }>,
): DeliveryValidationResult {
  if (input.subscription.revokedAt !== null) {
    return { kind: "suppress", code: "subscription_revoked" };
  }

  const spec = storedReminderPolicySpec(input.reminder);
  const target = resolveReminderTarget({
    spec,
    enabled: input.reminder.enabled,
    task: input.task,
    now: new Date(input.delivery.scheduledFor.getTime() - 1),
  });
  if (target.kind === "dormant") return { kind: "suppress", code: target.code };
  if (
    target.scheduledFor.getTime() !== input.delivery.scheduledFor.getTime() ||
    target.occurrenceKey !== input.delivery.occurrenceKey
  ) {
    return { kind: "suppress", code: "schedule_changed" };
  }

  const currentKey = input.digest.sha256Hex(
    deliveryIdempotencyCanonicalValue({
      userId: input.delivery.userId,
      reminderId: input.reminder.id,
      reminderVersion: input.reminder.version,
      subscriptionId: input.subscription.id,
      occurrenceKey: input.delivery.occurrenceKey,
      scheduledFor: input.delivery.scheduledFor,
    }),
  );
  return currentKey === input.delivery.idempotencyKey
    ? { kind: "valid", taskId: input.reminder.taskId }
    : { kind: "suppress", code: "obsolete" };
}
