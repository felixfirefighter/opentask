import type { NotificationErrorCode } from "../domain/notification-limits";

export type TaskReminderRecord = Readonly<{
  id: string;
  userId: string;
  taskId: string;
  kind: "absolute" | "relative_start";
  remindAt: Date | null;
  offsetMinutes: number | null;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PushSubscriptionRecord = Readonly<{
  id: string;
  userId: string;
  endpointHash: Uint8Array;
  endpointCiphertext: string;
  p256dhCiphertext: string;
  authCiphertext: string;
  encryptionKeyVersion: number;
  deviceLabel: string | null;
  userAgentSummary: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
}>;

export type NotificationDeliveryState =
  "scheduled" | "delivering" | "retry_scheduled" | "delivered" | "suppressed" | "failed";

export type NotificationDeliveryRecord = Readonly<{
  id: string;
  userId: string;
  reminderId: string;
  subscriptionId: string;
  occurrenceKey: string | null;
  scheduledFor: Date;
  state: NotificationDeliveryState;
  attemptCount: number;
  lastErrorCode: NotificationErrorCode | null;
  deliveredAt: Date | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type NotificationRecoveryResource = "deliveries" | "subscriptions" | "reminders";
