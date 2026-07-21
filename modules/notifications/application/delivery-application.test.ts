import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { Database, DatabaseExecutor } from "@/shared/db/client";

import { createDeliveryApplication } from "./delivery-application";
import type {
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushProvider,
  PushSubscriptionRepository,
  TaskReminderRepository,
} from "./notification-ports";
import type {
  NotificationDeliveryRecord,
  PushSubscriptionRecord,
  TaskReminderRecord,
} from "./notification-records";
import { deliveryIdempotencyCanonicalValue } from "../domain/delivery-idempotency";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  reminder: "33333333-3333-4333-8333-333333333333",
  subscription: "44444444-4444-4444-8444-444444444444",
  delivery: "55555555-5555-4555-8555-555555555555",
};
const now = new Date("2026-07-21T01:00:00.000Z");
const executor = {} as DatabaseExecutor;
const job = { schemaVersion: 1 as const, userId: ids.user, deliveryId: ids.delivery };

describe("delivery application adversarial outcomes", () => {
  it("commits the claim before I/O so a duplicate job cannot call the provider twice", async () => {
    let releaseProvider!: () => void;
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    let providerCalls = 0;
    const fixture = createFixture({
      configured: true,
      vapidPublicKey: "public",
      async send() {
        providerCalls += 1;
        markEntered();
        await blocked;
        return { kind: "accepted" };
      },
    });

    const first = fixture.application.deliverNotification(job);
    await entered;
    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "noop" });
    releaseProvider();
    await expect(first).resolves.toEqual({ outcome: "completed" });

    expect(providerCalls).toBe(1);
    expect(fixture.delivery()).toMatchObject({ state: "delivered", attemptCount: 1 });
  });

  it("allows only an explicit retryable result to enter retry_scheduled and be attempted again", async () => {
    const results = [{ kind: "retryable", code: "provider_http_503" }, { kind: "accepted" }] as const;
    let providerCalls = 0;
    const fixture = createFixture(providerFrom(async () => results[providerCalls++]!));

    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "retry" });
    expect(fixture.delivery()).toMatchObject({
      state: "retry_scheduled",
      attemptCount: 1,
      lastErrorCode: "provider_retryable",
    });
    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "completed" });
    expect(fixture.delivery()).toMatchObject({ state: "delivered", attemptCount: 2 });
    expect(providerCalls).toBe(2);
  });

  it("makes an unknown remote outcome terminal and never resends it", async () => {
    let providerCalls = 0;
    const fixture = createFixture(
      providerFrom(async () => {
        providerCalls += 1;
        return { kind: "outcome_unknown" };
      }),
    );

    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "completed" });
    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "noop" });
    expect(fixture.delivery()).toMatchObject({
      state: "failed",
      attemptCount: 1,
      lastErrorCode: "outcome_unknown",
    });
    expect(providerCalls).toBe(1);
  });

  it("suppresses a recovered greater-than-31-day delivery before any provider call", async () => {
    let providerCalls = 0;
    const fixture = createFixture(
      providerFrom(async () => {
        providerCalls += 1;
        return { kind: "accepted" };
      }),
      deliveryRecord(new Date(now.getTime() - 32 * 24 * 60 * 60 * 1_000)),
    );

    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "noop" });
    expect(fixture.delivery()).toMatchObject({
      state: "suppressed",
      attemptCount: 0,
      lastErrorCode: "stale",
    });
    expect(providerCalls).toBe(0);
    expect(fixture.maintenance().map(({ kind }) => kind)).toEqual(["delivery_cleanup", "recurring_repair"]);
  });

  it("revokes a gone subscription and schedules only actor-scoped terminal maintenance", async () => {
    let providerCalls = 0;
    const fixture = createFixture(
      providerFrom(async () => {
        providerCalls += 1;
        return { kind: "subscription_gone" };
      }),
    );

    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "completed" });
    await expect(fixture.application.deliverNotification(job)).resolves.toEqual({ outcome: "noop" });
    expect(fixture.delivery()).toMatchObject({ state: "failed", lastErrorCode: "subscription_gone" });
    expect(fixture.subscription().revokedAt).toEqual(now);
    expect(providerCalls).toBe(1);
    expect(fixture.maintenance().map(({ kind }) => kind)).toEqual([
      "delivery_lease",
      "delivery_cleanup",
      "recurring_repair",
      "subscription_cleanup",
    ]);
    expect(fixture.maintenance().every(({ userId }) => userId === ids.user)).toBe(true);
  });
});

function providerFrom(send: PushProvider["send"]): PushProvider {
  return { configured: true, vapidPublicKey: "public", send };
}

function createFixture(provider: PushProvider, initialDelivery = deliveryRecord()) {
  let currentDelivery = initialDelivery;
  let currentSubscription = subscriptionRecord();
  const maintenanceJobs: Array<{ kind: string; userId: string }> = [];
  const scheduler: NotificationJobScheduler = {
    ensureQueues: async () => {},
    sendDelivery: async () => {},
    sendMaintenance: async (maintenanceJob) => {
      maintenanceJobs.push({ kind: maintenanceJob.kind, userId: maintenanceJob.userId });
    },
  };
  const application = createDeliveryApplication({
    database: fakeDatabase(),
    clock: { now: () => now },
    tasks: {
      async readOwned(actor, input) {
        expect(actor.userId).toBe(ids.user);
        expect(input.taskId).toBe(ids.task);
        return {
          taskId: ids.task,
          status: "open",
          deleted: false,
          recurring: false,
          relativeStart: null,
        };
      },
    },
    reminders: reminderRepository(),
    subscriptions: subscriptionRepository(
      () => currentSubscription,
      (next) => {
        currentSubscription = next;
      },
    ),
    deliveries: deliveryRepository(
      () => currentDelivery,
      (next) => {
        currentDelivery = next;
      },
    ),
    cipher: {
      configured: true,
      activeKeyVersion: 1,
      encrypt: () => "unused",
      decrypt: ({ field }) =>
        field === "endpoint" ? "https://push.example.test/secret" : field === "p256dh" ? "p256dh" : "auth",
    },
    digest: {
      sha256Bytes: (value) => new Uint8Array(createHash("sha256").update(value).digest()),
      sha256Hex: (value) => createHash("sha256").update(value).digest("hex"),
    },
    scheduler,
    provider,
  });
  return {
    application,
    delivery: () => currentDelivery,
    subscription: () => currentSubscription,
    maintenance: () => maintenanceJobs,
  };
}

function fakeDatabase(): Database {
  return {
    transaction: async (work: (transaction: DatabaseExecutor) => Promise<unknown>) => work(executor),
  } as unknown as Database;
}

function reminderRepository(): TaskReminderRepository {
  const reminder: TaskReminderRecord = {
    id: ids.reminder,
    userId: ids.user,
    taskId: ids.task,
    kind: "absolute",
    remindAt: now,
    offsetMinutes: null,
    enabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return {
    findByTask: async () => reminder,
    findById: async (userId, reminderId) =>
      userId === reminder.userId && reminderId === reminder.id ? reminder : null,
    insert: async () => null,
    replace: async () => null,
    remove: async () => null,
    listRecoveryPage: async () => [reminder],
  };
}

function deliveryRecord(scheduledFor = now): NotificationDeliveryRecord {
  const idempotencyKey = createHash("sha256")
    .update(
      deliveryIdempotencyCanonicalValue({
        userId: ids.user,
        reminderId: ids.reminder,
        reminderVersion: 1,
        subscriptionId: ids.subscription,
        occurrenceKey: null,
        scheduledFor,
      }),
    )
    .digest("hex");
  return {
    id: ids.delivery,
    userId: ids.user,
    reminderId: ids.reminder,
    subscriptionId: ids.subscription,
    occurrenceKey: null,
    scheduledFor,
    state: "scheduled",
    attemptCount: 0,
    lastErrorCode: null,
    deliveredAt: null,
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
}

function deliveryRepository(
  read: () => NotificationDeliveryRecord,
  write: (record: NotificationDeliveryRecord) => void,
): NotificationDeliveryRepository {
  return {
    findById: async (userId, deliveryId) =>
      userId === read().userId && deliveryId === read().id ? read() : null,
    listByReminder: async () => [read()],
    listBySubscription: async () => [read()],
    insertIfAbsent: async () => ({ delivery: read(), inserted: false }),
    async writeState(input) {
      const current = read();
      if (
        current.userId !== input.userId ||
        current.id !== input.id ||
        current.state !== input.expectedState ||
        current.attemptCount !== input.expectedAttemptCount
      ) {
        return null;
      }
      const next: NotificationDeliveryRecord = { ...current, ...input, updatedAt: input.now };
      write(next);
      return next;
    },
    removeTerminal: async () => false,
    hasForSubscription: async () => true,
    listRecoveryPage: async () => [read()],
  };
}

function subscriptionRecord(): PushSubscriptionRecord {
  return {
    id: ids.subscription,
    userId: ids.user,
    endpointHash: new Uint8Array(32),
    endpointCiphertext: "endpoint",
    p256dhCiphertext: "p256dh",
    authCiphertext: "auth",
    encryptionKeyVersion: 1,
    deviceLabel: null,
    userAgentSummary: null,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
  };
}

function subscriptionRepository(
  read: () => PushSubscriptionRecord,
  write: (record: PushSubscriptionRecord) => void,
): PushSubscriptionRepository {
  return {
    lockRegistrationScope: async () => undefined,
    listActiveIdsUpTo: async () => (read().revokedAt ? [] : [read().id]),
    findActiveByEndpointHash: async () => read(),
    listActive: async () => (read().revokedAt ? [] : [read()]),
    findById: async (userId, subscriptionId) =>
      userId === read().userId && subscriptionId === read().id ? read() : null,
    insert: async () => ({ kind: "endpoint_conflict" }),
    refresh: async () => read(),
    async revoke(userId, subscriptionId, revokedAt) {
      if (userId !== read().userId || subscriptionId !== read().id) return null;
      const next = { ...read(), revokedAt };
      write(next);
      return next;
    },
    removeRevoked: async () => false,
    listRecoveryPage: async () => [read()],
  };
}
