import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { Database, DatabaseExecutor } from "@/shared/db/client";

import type {
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushSubscriptionRepository,
  TaskReminderRepository,
} from "./notification-ports";
import type { NotificationDeliveryRecord, TaskReminderRecord } from "./notification-records";
import { createNotificationReconciler } from "./notification-reconciler";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  reminder: "33333333-3333-4333-8333-333333333333",
  subscription: "44444444-4444-4444-8444-444444444444",
  delivery: "55555555-5555-4555-8555-555555555555",
};
const now = new Date("2026-07-21T00:00:00.000Z");
const executor = {} as DatabaseExecutor;

describe("notification reconciliation", () => {
  it("creates one deterministic delivery and suppresses it when the task becomes terminal", async () => {
    let taskStatus: "open" | "completed" = "open";
    let storedDeliveries: NotificationDeliveryRecord[] = [];
    const reminder: TaskReminderRecord = {
      id: ids.reminder,
      userId: ids.user,
      taskId: ids.task,
      kind: "absolute",
      remindAt: new Date("2026-07-21T01:00:00.000Z"),
      offsetMinutes: null,
      enabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const jobs: string[] = [];
    const maintenanceKinds: string[] = [];
    const deliveries = deliveryRepository(
      () => storedDeliveries,
      (next) => {
        storedDeliveries = next;
      },
    );
    const reconciler = createNotificationReconciler({
      database: fakeDatabase(),
      clock: { now: () => now },
      tasks: {
        async readOwned() {
          return {
            taskId: ids.task,
            status: taskStatus,
            deleted: false,
            recurring: false,
            relativeStart: null,
          };
        },
      },
      reminders: reminderRepository(reminder),
      subscriptions: subscriptionRepository(),
      deliveries,
      scheduler: scheduler(jobs, maintenanceKinds),
      digest: {
        sha256Bytes: (value) => new Uint8Array(createHash("sha256").update(value).digest()),
        sha256Hex: (value) => createHash("sha256").update(value).digest("hex"),
      },
      ids: { next: () => ids.delivery },
    });

    await reconciler.ensureProducer();
    await reconciler.reconcileOne({ userId: ids.user }, ids.task, "schedule_changed", executor);
    await reconciler.reconcileOne({ userId: ids.user }, ids.task, "schedule_changed", executor);
    expect(storedDeliveries).toHaveLength(1);
    expect(storedDeliveries[0]).toMatchObject({
      state: "scheduled",
      attemptCount: 0,
      occurrenceKey: null,
    });
    expect(storedDeliveries[0]?.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(jobs).toEqual([ids.delivery]);

    taskStatus = "completed";
    await reconciler.reconcileOne({ userId: ids.user }, ids.task, "task_terminal", executor);
    expect(storedDeliveries[0]).toMatchObject({
      state: "suppressed",
      attemptCount: 0,
      lastErrorCode: "task_terminal",
    });
    expect(maintenanceKinds).toContain("delivery_cleanup");
    expect(maintenanceKinds.filter((kind) => kind === "delivery_cleanup")).toHaveLength(1);

    await reconciler.reconcileOne({ userId: ids.user }, ids.task, "task_terminal", executor);
    expect(maintenanceKinds.filter((kind) => kind === "delivery_cleanup")).toHaveLength(1);
  });
});

function fakeDatabase(): Database {
  return {
    transaction: async (work: (transaction: DatabaseExecutor) => Promise<unknown>) => work(executor),
  } as unknown as Database;
}

function reminderRepository(reminder: TaskReminderRecord): TaskReminderRepository {
  return {
    findByTask: async () => reminder,
    findById: async () => reminder,
    insert: async () => null,
    replace: async () => null,
    remove: async () => null,
    listRecoveryPage: async () => [reminder],
  };
}

function subscriptionRepository(): PushSubscriptionRepository {
  const subscription = {
    id: ids.subscription,
    userId: ids.user,
    endpointHash: new Uint8Array(32),
    endpointCiphertext: "encrypted",
    p256dhCiphertext: "encrypted",
    authCiphertext: "encrypted",
    encryptionKeyVersion: 0,
    deviceLabel: null,
    userAgentSummary: null,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
  };
  return {
    lockRegistrationScope: async () => undefined,
    listActiveIdsUpTo: async () => [subscription.id],
    findActiveByEndpointHash: async () => subscription,
    listActive: async () => [subscription],
    findById: async () => subscription,
    insert: async () => ({ kind: "inserted", subscription }),
    refresh: async () => subscription,
    revoke: async () => subscription,
    removeRevoked: async () => false,
    listRecoveryPage: async () => [subscription],
  };
}

function deliveryRepository(
  read: () => NotificationDeliveryRecord[],
  write: (records: NotificationDeliveryRecord[]) => void,
): NotificationDeliveryRepository {
  return {
    findById: async (_userId, deliveryId) => read().find(({ id }) => id === deliveryId) ?? null,
    listByReminder: async () => read(),
    listBySubscription: async () => read(),
    async insertIfAbsent(input) {
      const existing = read().find(({ idempotencyKey }) => idempotencyKey === input.idempotencyKey);
      if (existing) return { delivery: existing, inserted: false };
      const delivery: NotificationDeliveryRecord = {
        ...input,
        state: "scheduled",
        attemptCount: 0,
        lastErrorCode: null,
        deliveredAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      write([...read(), delivery]);
      return { delivery, inserted: true };
    },
    async writeState(input) {
      const current = read().find(({ id }) => id === input.id);
      if (!current) return null;
      const next = { ...current, ...input, updatedAt: input.now };
      write(read().map((delivery) => (delivery.id === input.id ? next : delivery)));
      return next;
    },
    removeTerminal: async () => false,
    hasForSubscription: async () => read().length > 0,
    listRecoveryPage: async () => read(),
  };
}

function scheduler(jobs: string[], maintenanceKinds: string[]): NotificationJobScheduler {
  return {
    ensureQueues: async () => {},
    sendDelivery: async (job) => {
      jobs.push(job.deliveryId);
    },
    sendMaintenance: async (job) => {
      maintenanceKinds.push(job.kind);
    },
  };
}
