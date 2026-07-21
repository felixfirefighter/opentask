import {
  NOTIFICATION_ATTEMPT_MAX,
  NOTIFICATION_DELIVERY_LEASE_SECONDS,
  NOTIFICATION_PUSH_TTL_MAX_SECONDS,
  NOTIFICATION_RETRY_BASE_SECONDS,
  NOTIFICATION_RETRY_MAX_SECONDS,
  NOTIFICATION_STALE_AFTER_SECONDS,
} from "./notification-limits";
import type { ReminderSuppressionCode } from "./reminder-policy";

export const REVERSIBLE_SUPPRESSION_CODES = [
  "schedule_changed",
  "task_deleted",
  "task_terminal",
  "occurrence_terminal",
] as const satisfies readonly ReminderSuppressionCode[];

export type DeliveryPolicyState =
  "scheduled" | "delivering" | "retry_scheduled" | "delivered" | "suppressed" | "failed";

export function notificationStaleAt(scheduledFor: Date): Date {
  return addSeconds(scheduledFor, NOTIFICATION_STALE_AFTER_SECONDS);
}

export function isNotificationStale(scheduledFor: Date, now: Date): boolean {
  return now.getTime() >= notificationStaleAt(scheduledFor).getTime();
}

export function notificationPushTtlSeconds(scheduledFor: Date, now: Date): number {
  const remainingMilliseconds = notificationStaleAt(scheduledFor).getTime() - now.getTime();
  if (remainingMilliseconds <= 0) return 0;
  return Math.min(Math.ceil(remainingMilliseconds / 1_000), NOTIFICATION_PUSH_TTL_MAX_SECONDS);
}

export function notificationRetryDelaySeconds(attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 1 || attemptCount >= NOTIFICATION_ATTEMPT_MAX) {
    throw new RangeError("A retry delay requires an attempted delivery below the final attempt.");
  }
  return Math.min(NOTIFICATION_RETRY_BASE_SECONDS * 2 ** (attemptCount - 1), NOTIFICATION_RETRY_MAX_SECONDS);
}

export function notificationLeaseExpiresAt(deliveringAt: Date): Date {
  return addSeconds(deliveringAt, NOTIFICATION_DELIVERY_LEASE_SECONDS);
}

export function canClaimNotification(state: DeliveryPolicyState, attemptCount: number): boolean {
  return (
    (state === "scheduled" || state === "retry_scheduled") &&
    Number.isInteger(attemptCount) &&
    attemptCount >= 0 &&
    attemptCount < NOTIFICATION_ATTEMPT_MAX
  );
}

export function canReactivateSuppressedDelivery(
  input: Readonly<{
    state: DeliveryPolicyState;
    attemptCount: number;
    errorCode: string | null;
    scheduledFor: Date;
    now: Date;
  }>,
): boolean {
  return (
    input.state === "suppressed" &&
    input.attemptCount === 0 &&
    input.errorCode !== null &&
    REVERSIBLE_SUPPRESSION_CODES.includes(input.errorCode as (typeof REVERSIBLE_SUPPRESSION_CODES)[number]) &&
    input.scheduledFor.getTime() > input.now.getTime()
  );
}

export function isTerminalDeliveryState(state: DeliveryPolicyState): boolean {
  return state === "delivered" || state === "suppressed" || state === "failed";
}

function addSeconds(value: Date, seconds: number): Date {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new RangeError("The notification instant is invalid.");
  return new Date(milliseconds + seconds * 1_000);
}
