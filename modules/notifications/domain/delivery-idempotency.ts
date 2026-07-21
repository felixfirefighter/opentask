export const DELIVERY_IDEMPOTENCY_VERSION = "opentask-notification-delivery-v1";

export function deliveryIdempotencyCanonicalValue(
  input: Readonly<{
    userId: string;
    reminderId: string;
    reminderVersion: number;
    subscriptionId: string;
    occurrenceKey: string | null;
    scheduledFor: Date;
  }>,
): string {
  if (!Number.isInteger(input.reminderVersion) || input.reminderVersion < 1) {
    throw new RangeError("A delivery idempotency value requires a positive reminder version.");
  }
  if (!Number.isFinite(input.scheduledFor.getTime())) {
    throw new RangeError("A delivery idempotency value requires a valid scheduled instant.");
  }
  return [
    DELIVERY_IDEMPOTENCY_VERSION,
    input.userId,
    input.reminderId,
    String(input.reminderVersion),
    input.subscriptionId,
    input.occurrenceKey ?? "none",
    input.scheduledFor.toISOString(),
  ].join("\0");
}
