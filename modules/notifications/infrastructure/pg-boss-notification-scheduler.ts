import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss, type Db, type QueueResult } from "pg-boss";

import { getEnvironment } from "@/shared/config/environment";
import type { DatabaseExecutor } from "@/shared/db/client";
import { logger } from "@/shared/logging/logger";

export const NOTIFICATION_DELIVERY_QUEUE = "notification_delivery_v1";
export const NOTIFICATION_MAINTENANCE_QUEUE = "notification_maintenance_v1";
export const NOTIFICATION_QUEUE_NAMES = [
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_MAINTENANCE_QUEUE,
] as const;

export const NOTIFICATION_DELIVERY_WORK_OPTIONS = { batchSize: 1, localConcurrency: 4 } as const;
export const NOTIFICATION_MAINTENANCE_WORK_OPTIONS = { batchSize: 1, localConcurrency: 1 } as const;

const queueDefinitions = [
  {
    name: NOTIFICATION_DELIVERY_QUEUE,
    options: {
      policy: "standard" as const,
      expireInSeconds: 60,
      retentionSeconds: 2_678_400,
      deleteAfterSeconds: 86_400,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 300,
    },
  },
  {
    name: NOTIFICATION_MAINTENANCE_QUEUE,
    options: {
      policy: "standard" as const,
      expireInSeconds: 120,
      retentionSeconds: 2_678_400,
      deleteAfterSeconds: 86_400,
      retryLimit: 1,
      retryDelay: 60,
      retryBackoff: false,
    },
  },
] as const;

type NotificationPgBoss = Pick<PgBoss, "createQueue" | "getQueue" | "send">;
type TransactionAdapter = (executor: DatabaseExecutor) => Db;
type NotificationDeliveryJob = Readonly<{ schemaVersion: 1; userId: string; deliveryId: string }>;
type NotificationMaintenanceJob =
  | Readonly<{ schemaVersion: 1; userId: string; kind: "delivery_lease"; deliveryId: string }>
  | Readonly<{ schemaVersion: 1; userId: string; kind: "delivery_cleanup"; deliveryId: string }>
  | Readonly<{
      schemaVersion: 1;
      userId: string;
      kind: "subscription_cleanup";
      subscriptionId: string;
    }>
  | Readonly<{ schemaVersion: 1; userId: string; kind: "recurring_repair"; reminderId: string }>
  | Readonly<{
      schemaVersion: 1;
      userId: string;
      kind: "actor_recovery";
      after: Readonly<{
        resource: "deliveries" | "subscriptions" | "reminders";
        id: string;
      }> | null;
    }>;

export type NotificationJobSchedulerAdapter = Readonly<{
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
}>;

let productionScheduler: NotificationJobSchedulerAdapter | undefined;

export class NotificationQueueConfigurationError extends Error {
  readonly queueName: string;

  constructor(queueName: string) {
    super(`Notification queue configuration does not match the release contract: ${queueName}`);
    this.name = "NotificationQueueConfigurationError";
    this.queueName = queueName;
  }
}

export function createPgBossNotificationJobScheduler(
  boss: NotificationPgBoss,
  transactionAdapter: TransactionAdapter = createTransactionAdapter,
): NotificationJobSchedulerAdapter {
  let ensureInFlight: Promise<void> | null = null;

  return {
    ensureQueues() {
      ensureInFlight ??= ensureNotificationQueues(boss).catch((error: unknown) => {
        ensureInFlight = null;
        throw error;
      });
      return ensureInFlight;
    },

    async sendDelivery(job, options, executor) {
      const payload = sanitizeDeliveryJob(job);
      if (canonicalUuid(options.jobId) !== payload.deliveryId) {
        throw new NotificationJobPayloadError();
      }
      assertStartAfter(options.startAfter);
      await boss.send(NOTIFICATION_DELIVERY_QUEUE, payload, {
        id: payload.deliveryId,
        startAfter: options.startAfter,
        db: transactionAdapter(executor),
      });
    },

    async sendMaintenance(job, options, executor) {
      const payload = sanitizeMaintenanceJob(job);
      assertStartAfter(options.startAfter);
      await boss.send(NOTIFICATION_MAINTENANCE_QUEUE, payload, {
        id: deterministicMaintenanceJobId(options.dedupeKey),
        startAfter: options.startAfter,
        db: transactionAdapter(executor),
      });
    },
  };
}

export function getProductionNotificationJobScheduler(): NotificationJobSchedulerAdapter {
  if (productionScheduler) return productionScheduler;
  const boss = new PgBoss({
    connectionString: getEnvironment().DATABASE_URL,
    application_name: "opentask-web-notification-producer",
  });
  boss.on("error", (error) => {
    logger.event("WORKER_QUEUE_ERROR", { errorName: error.name });
  });
  productionScheduler = createStartingPgBossNotificationJobScheduler(boss);
  return productionScheduler;
}

export function createStartingPgBossNotificationJobScheduler(
  boss: PgBoss,
  transactionAdapter: TransactionAdapter = createTransactionAdapter,
): NotificationJobSchedulerAdapter {
  const scheduler = createPgBossNotificationJobScheduler(boss, transactionAdapter);
  let startInFlight: Promise<void> | null = null;
  let ready = false;
  return {
    async ensureQueues() {
      startInFlight ??= boss.start().then(() => undefined);
      await startInFlight;
      await scheduler.ensureQueues();
      ready = true;
    },
    async sendDelivery(job, options, executor) {
      if (!ready) throw new NotificationProducerNotReadyError();
      return scheduler.sendDelivery(job, options, executor);
    },
    async sendMaintenance(job, options, executor) {
      if (!ready) throw new NotificationProducerNotReadyError();
      return scheduler.sendMaintenance(job, options, executor);
    },
  };
}

export class NotificationProducerNotReadyError extends Error {
  constructor() {
    super("Notification producer was not prepared before the transaction.");
    this.name = "NotificationProducerNotReadyError";
  }
}

export function deterministicMaintenanceJobId(dedupeKey: string): string {
  if (dedupeKey.length < 1 || dedupeKey.length > 500 || dedupeKey.includes("\0")) {
    throw new RangeError("Notification maintenance dedupe key is invalid.");
  }
  const bytes = createHash("sha256")
    .update("opentask-notification-maintenance-v1\0", "utf8")
    .update(dedupeKey, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function ensureNotificationQueues(boss: NotificationPgBoss): Promise<void> {
  for (const definition of queueDefinitions) {
    await boss.createQueue(definition.name, definition.options);
    const current = await boss.getQueue(definition.name);
    if (!current || !matchesQueueDefinition(current, definition.options)) {
      throw new NotificationQueueConfigurationError(definition.name);
    }
  }
}

function matchesQueueDefinition(
  current: QueueResult,
  expected: (typeof queueDefinitions)[number]["options"],
): boolean {
  return (
    current.policy === expected.policy &&
    current.expireInSeconds === expected.expireInSeconds &&
    current.retentionSeconds === expected.retentionSeconds &&
    current.deleteAfterSeconds === expected.deleteAfterSeconds &&
    current.retryLimit === expected.retryLimit &&
    current.retryDelay === expected.retryDelay &&
    current.retryBackoff === expected.retryBackoff &&
    ("retryDelayMax" in expected ? current.retryDelayMax === expected.retryDelayMax : true)
  );
}

function createTransactionAdapter(executor: DatabaseExecutor): Db {
  return fromDrizzle(executor, sql);
}

function sanitizeDeliveryJob(job: NotificationDeliveryJob): NotificationDeliveryJob {
  assertExactKeys(job, ["schemaVersion", "userId", "deliveryId"]);
  if (job.schemaVersion !== 1) throw new NotificationJobPayloadError();
  return {
    schemaVersion: 1,
    userId: canonicalUuid(job.userId),
    deliveryId: canonicalUuid(job.deliveryId),
  };
}

function sanitizeMaintenanceJob(job: NotificationMaintenanceJob): NotificationMaintenanceJob {
  if (job.schemaVersion !== 1) throw new NotificationJobPayloadError();
  const userId = canonicalUuid(job.userId);
  if (job.kind === "delivery_lease" || job.kind === "delivery_cleanup") {
    assertExactKeys(job, ["schemaVersion", "userId", "kind", "deliveryId"]);
    return { schemaVersion: 1, userId, kind: job.kind, deliveryId: canonicalUuid(job.deliveryId) };
  }
  if (job.kind === "subscription_cleanup") {
    assertExactKeys(job, ["schemaVersion", "userId", "kind", "subscriptionId"]);
    return {
      schemaVersion: 1,
      userId,
      kind: job.kind,
      subscriptionId: canonicalUuid(job.subscriptionId),
    };
  }
  if (job.kind === "recurring_repair") {
    assertExactKeys(job, ["schemaVersion", "userId", "kind", "reminderId"]);
    return {
      schemaVersion: 1,
      userId,
      kind: job.kind,
      reminderId: canonicalUuid(job.reminderId),
    };
  }
  if (job.kind !== "actor_recovery") throw new NotificationJobPayloadError();
  assertExactKeys(job, ["schemaVersion", "userId", "kind", "after"]);
  if (job.after === null) return { schemaVersion: 1, userId, kind: job.kind, after: null };
  assertExactKeys(job.after, ["resource", "id"]);
  if (!(["deliveries", "subscriptions", "reminders"] as const).includes(job.after.resource)) {
    throw new NotificationJobPayloadError();
  }
  return {
    schemaVersion: 1,
    userId,
    kind: job.kind,
    after: { resource: job.after.resource, id: canonicalUuid(job.after.id) },
  };
}

class NotificationJobPayloadError extends Error {
  constructor() {
    super("Notification job payload is invalid.");
    this.name = "NotificationJobPayloadError";
  }
}

function canonicalUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new NotificationJobPayloadError();
  }
  return value.toLowerCase();
}

function assertExactKeys(value: object, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    throw new NotificationJobPayloadError();
  }
}

function assertStartAfter(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new NotificationJobPayloadError();
  }
}
