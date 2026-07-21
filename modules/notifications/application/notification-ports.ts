import type { DatabaseExecutor } from "@/shared/db/client";

import type { NotificationDeliveryJob, NotificationMaintenanceJob, PushCapability } from "./contracts";
import type {
  NotificationDeliveryRecord,
  NotificationDeliveryState,
  PushSubscriptionRecord,
  TaskReminderRecord,
} from "./notification-records";
import type { NotificationErrorCode } from "../domain/notification-limits";

export interface TaskReminderRepository {
  findByTask(
    userId: string,
    taskId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<TaskReminderRecord | null>;
  findById(
    userId: string,
    reminderId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<TaskReminderRecord | null>;
  insert(
    input: Readonly<{
      id: string;
      userId: string;
      taskId: string;
      kind: "absolute" | "relative_start";
      remindAt: Date | null;
      offsetMinutes: number | null;
      enabled: boolean;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<TaskReminderRecord | null>;
  replace(
    input: Readonly<{
      userId: string;
      taskId: string;
      expectedVersion: number;
      kind: "absolute" | "relative_start";
      remindAt: Date | null;
      offsetMinutes: number | null;
      enabled: boolean;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<TaskReminderRecord | null>;
  remove(
    userId: string,
    taskId: string,
    expectedVersion: number,
    executor: DatabaseExecutor,
  ): Promise<TaskReminderRecord | null>;
  listRecoveryPage(
    userId: string,
    afterId: string | null,
    limit: number,
    executor: DatabaseExecutor,
  ): Promise<readonly TaskReminderRecord[]>;
}

export type InsertPushSubscriptionResult =
  | { kind: "inserted"; subscription: PushSubscriptionRecord }
  | { kind: "endpoint_conflict" }
  | { kind: "id_conflict" };

export interface PushSubscriptionRepository {
  lockRegistrationScope(userId: string, executor: DatabaseExecutor): Promise<void>;
  listActiveIdsUpTo(userId: string, limit: number, executor: DatabaseExecutor): Promise<readonly string[]>;
  findActiveByEndpointHash(
    userId: string,
    endpointHash: Uint8Array,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<PushSubscriptionRecord | null>;
  listActive(
    userId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<readonly PushSubscriptionRecord[]>;
  findById(
    userId: string,
    subscriptionId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<PushSubscriptionRecord | null>;
  insert(
    input: Readonly<{
      id: string;
      userId: string;
      endpointHash: Uint8Array;
      endpointCiphertext: string;
      p256dhCiphertext: string;
      authCiphertext: string;
      encryptionKeyVersion: number;
      deviceLabel: string | null;
      userAgentSummary: string | null;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<InsertPushSubscriptionResult>;
  refresh(
    input: Readonly<{
      userId: string;
      id: string;
      endpointCiphertext: string;
      p256dhCiphertext: string;
      authCiphertext: string;
      encryptionKeyVersion: number;
      deviceLabel: string | null;
      userAgentSummary: string | null;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<PushSubscriptionRecord | null>;
  revoke(
    userId: string,
    subscriptionId: string,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<PushSubscriptionRecord | null>;
  removeRevoked(
    userId: string,
    subscriptionId: string,
    revokedBefore: Date,
    executor: DatabaseExecutor,
  ): Promise<boolean>;
  listRecoveryPage(
    userId: string,
    afterId: string | null,
    limit: number,
    executor: DatabaseExecutor,
  ): Promise<readonly PushSubscriptionRecord[]>;
}

export type InsertNotificationDeliveryResult = Readonly<{
  delivery: NotificationDeliveryRecord;
  inserted: boolean;
}>;

export interface NotificationDeliveryRepository {
  findById(
    userId: string,
    deliveryId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<NotificationDeliveryRecord | null>;
  listByReminder(
    userId: string,
    reminderId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<readonly NotificationDeliveryRecord[]>;
  listBySubscription(
    userId: string,
    subscriptionId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<readonly NotificationDeliveryRecord[]>;
  insertIfAbsent(
    input: Readonly<{
      id: string;
      userId: string;
      reminderId: string;
      subscriptionId: string;
      occurrenceKey: string | null;
      scheduledFor: Date;
      idempotencyKey: string;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<InsertNotificationDeliveryResult>;
  writeState(
    input: Readonly<{
      userId: string;
      id: string;
      expectedState: NotificationDeliveryState;
      expectedAttemptCount: number;
      state: NotificationDeliveryState;
      attemptCount: number;
      lastErrorCode: NotificationErrorCode | null;
      deliveredAt: Date | null;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<NotificationDeliveryRecord | null>;
  removeTerminal(
    userId: string,
    deliveryId: string,
    updatedBefore: Date,
    executor: DatabaseExecutor,
  ): Promise<boolean>;
  hasForSubscription(userId: string, subscriptionId: string, executor: DatabaseExecutor): Promise<boolean>;
  listRecoveryPage(
    userId: string,
    afterId: string | null,
    limit: number,
    executor: DatabaseExecutor,
  ): Promise<readonly NotificationDeliveryRecord[]>;
}

export type SubscriptionCipherField = "endpoint" | "p256dh" | "auth";

export interface SubscriptionCipher {
  readonly configured: boolean;
  readonly activeKeyVersion: number | null;
  encrypt(
    input: Readonly<{
      userId: string;
      subscriptionId: string;
      field: SubscriptionCipherField;
      keyVersion: number;
      plaintext: string;
    }>,
  ): string;
  decrypt(
    input: Readonly<{
      userId: string;
      subscriptionId: string;
      field: SubscriptionCipherField;
      keyVersion: number;
      ciphertext: string;
    }>,
  ): string;
}

export interface NotificationDigest {
  sha256Bytes(value: string): Uint8Array;
  sha256Hex(value: string): string;
}

export type PushProviderResult =
  | { kind: "accepted" }
  | { kind: "retryable"; code: string }
  | { kind: "subscription_gone" }
  | { kind: "permanent"; code: string }
  | { kind: "outcome_unknown" };

export interface PushProvider {
  readonly configured: boolean;
  readonly vapidPublicKey: string | null;
  send(
    input: Readonly<{
      endpoint: string;
      p256dh: string;
      auth: string;
      payload: Readonly<{ schemaVersion: 1; taskId: string; deliveryId: string }>;
      ttlSeconds: number;
      timeoutMs: number;
    }>,
  ): Promise<PushProviderResult>;
}

export interface NotificationJobScheduler {
  ensureQueues(): Promise<void>;
  sendDelivery(
    job: NotificationDeliveryJob,
    options: Readonly<{ jobId: string; startAfter: Date }>,
    executor: DatabaseExecutor,
  ): Promise<void>;
  sendMaintenance(
    job: NotificationMaintenanceJob,
    options: Readonly<{ startAfter: Date; dedupeKey: string }>,
    executor: DatabaseExecutor,
  ): Promise<void>;
}

export interface NotificationRuntimeConfiguration {
  capability(): PushCapability;
}

export interface NotificationIdGenerator {
  next(): string;
}
