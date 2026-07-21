import { describe, expect, it } from "vitest";

import type { Database, DatabaseExecutor } from "@/shared/db/client";

import type { NotificationDeliveryJob, NotificationMaintenanceJob } from "./contracts";
import { createMaintenanceApplication } from "./maintenance-application";
import type {
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushSubscriptionRepository,
  TaskReminderRepository,
} from "./notification-ports";
import type { NotificationReconciler } from "./notification-reconciler";
import type {
  NotificationDeliveryRecord,
  PushSubscriptionRecord,
  TaskReminderRecord,
} from "./notification-records";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  foreignUser: "99999999-9999-4999-8999-999999999999",
  task: "22222222-2222-4222-8222-222222222222",
  reminder: "33333333-3333-4333-8333-333333333333",
  subscription: "44444444-4444-4444-8444-444444444444",
  delivery: "55555555-5555-4555-8555-555555555555",
};
const now = new Date("2026-07-21T01:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1_000;
const executor = {} as DatabaseExecutor;

describe("notification maintenance application", () => {
  it("turns an expired delivering lease into terminal outcome_unknown for only the job actor", async () => {
    const fixture = createFixture({
      delivery: deliveryRecord("delivering", new Date(now.getTime() - 2 * 60_000)),
    });

    await fixture.application.runNotificationMaintenance({
      schemaVersion: 1,
      userId: ids.foreignUser,
      kind: "delivery_lease",
      deliveryId: ids.delivery,
    });
    expect(fixture.delivery()?.state).toBe("delivering");

    await fixture.application.runNotificationMaintenance({
      schemaVersion: 1,
      userId: ids.user,
      kind: "delivery_lease",
      deliveryId: ids.delivery,
    });
    expect(fixture.delivery()).toMatchObject({ state: "failed", lastErrorCode: "outcome_unknown" });
    expect(fixture.maintenanceJobs().map(({ job }) => job.kind)).toEqual([
      "delivery_cleanup",
      "recurring_repair",
    ]);
  });

  it("reschedules before retention and removes terminal rows only after 30 days and dependency release", async () => {
    const fixture = createFixture({
      delivery: deliveryRecord("failed", new Date(now.getTime() - 29 * dayMs)),
      subscription: subscriptionRecord(new Date(now.getTime() - 31 * dayMs)),
      hasSubscriptionDelivery: true,
    });
    const deliveryCleanup = {
      schemaVersion: 1 as const,
      userId: ids.user,
      kind: "delivery_cleanup" as const,
      deliveryId: ids.delivery,
    };
    await fixture.application.runNotificationMaintenance(deliveryCleanup);
    expect(fixture.delivery()).not.toBeNull();
    expect(fixture.maintenanceJobs().at(-1)?.options.startAfter).toEqual(new Date(now.getTime() + dayMs));

    fixture.setDelivery(deliveryRecord("failed", new Date(now.getTime() - 30 * dayMs)));
    await fixture.application.runNotificationMaintenance(deliveryCleanup);
    expect(fixture.delivery()).toBeNull();

    const subscriptionCleanup = {
      schemaVersion: 1 as const,
      userId: ids.user,
      kind: "subscription_cleanup" as const,
      subscriptionId: ids.subscription,
    };
    await fixture.application.runNotificationMaintenance(subscriptionCleanup);
    expect(fixture.subscription()).not.toBeNull();
    expect(fixture.maintenanceJobs().at(-1)?.options.startAfter).toEqual(new Date(now.getTime() + dayMs));
    fixture.setHasSubscriptionDelivery(false);
    await fixture.application.runNotificationMaintenance(subscriptionCleanup);
    expect(fixture.subscription()).toBeNull();
  });

  it("recovers a greater-than-31-day outage through only the declared actor's resource pages", async () => {
    const fixture = createFixture({
      delivery: deliveryRecord("scheduled", new Date(now.getTime() - 32 * dayMs)),
      subscription: subscriptionRecord(new Date(now.getTime() - 31 * dayMs)),
      reminder: reminderRecord(),
    });
    await fixture.application.runNotificationMaintenance({
      schemaVersion: 1,
      userId: ids.user,
      kind: "actor_recovery",
      after: null,
    });
    expect(fixture.deliveryJobs()).toEqual([
      {
        job: { schemaVersion: 1, userId: ids.user, deliveryId: ids.delivery },
        options: { jobId: ids.delivery, startAfter: now },
      },
    ]);

    const subscriptionCursor = latestActorRecovery(fixture.maintenanceJobs());
    await fixture.application.runNotificationMaintenance(subscriptionCursor);
    expect(fixture.maintenanceJobs().some(({ job }) => job.kind === "subscription_cleanup")).toBe(true);

    const reminderCursor = latestActorRecovery(fixture.maintenanceJobs());
    await fixture.application.runNotificationMaintenance(reminderCursor);
    expect(fixture.reconciliations()).toContainEqual({
      userId: ids.user,
      taskId: ids.task,
      reason: "schedule_changed",
    });
    expect(fixture.recoveryReads().every(({ userId }) => userId === ids.user)).toBe(true);
  });

  it("repairs recurring work through the actor-scoped reminder target", async () => {
    const fixture = createFixture({ reminder: reminderRecord() });
    await fixture.application.runNotificationMaintenance({
      schemaVersion: 1,
      userId: ids.user,
      kind: "recurring_repair",
      reminderId: ids.reminder,
    });
    expect(fixture.reconciliations()).toEqual([
      { userId: ids.user, taskId: ids.task, reason: "occurrence_terminal" },
    ]);
  });
});

function latestActorRecovery(
  jobs: readonly { job: NotificationMaintenanceJob }[],
): Extract<NotificationMaintenanceJob, { kind: "actor_recovery" }> {
  const job = [...jobs].reverse().find(({ job }) => job.kind === "actor_recovery")?.job;
  if (!job || job.kind !== "actor_recovery") throw new Error("Expected an actor recovery continuation.");
  return job;
}

function createFixture(input: {
  delivery?: NotificationDeliveryRecord;
  subscription?: PushSubscriptionRecord;
  reminder?: TaskReminderRecord;
  hasSubscriptionDelivery?: boolean;
}) {
  let delivery = input.delivery ?? null;
  let subscription = input.subscription ?? null;
  const reminder = input.reminder ?? null;
  let hasSubscriptionDelivery = input.hasSubscriptionDelivery ?? false;
  const maintenanceJobs: Array<{
    job: NotificationMaintenanceJob;
    options: { startAfter: Date; dedupeKey: string };
  }> = [];
  const deliveryJobs: Array<{
    job: NotificationDeliveryJob;
    options: { jobId: string; startAfter: Date };
  }> = [];
  const reconciliations: Array<{ userId: string; taskId: string; reason: string }> = [];
  const recoveryReads: Array<{ resource: string; userId: string }> = [];
  const scheduler: NotificationJobScheduler = {
    ensureQueues: async () => {},
    sendDelivery: async (job, options) => {
      deliveryJobs.push({ job, options });
    },
    sendMaintenance: async (job, options) => {
      maintenanceJobs.push({ job, options });
    },
  };
  const reconciler: NotificationReconciler = {
    ensureProducer: async () => {},
    prepare: async () => {},
    reconcile: async () => {},
    async reconcileOne(actor, taskId, reason) {
      reconciliations.push({ userId: actor.userId, taskId, reason });
    },
    applyRecurrenceResolution: async () => {},
  };
  const application = createMaintenanceApplication({
    database: fakeDatabase(),
    clock: { now: () => now },
    reminders: reminderRepository(
      () => reminder,
      (userId) => recoveryReads.push({ resource: "reminders", userId }),
    ),
    subscriptions: subscriptionRepository(
      () => subscription,
      (next) => {
        subscription = next;
      },
      () => hasSubscriptionDelivery,
      (userId) => recoveryReads.push({ resource: "subscriptions", userId }),
    ),
    deliveries: deliveryRepository(
      () => delivery,
      (next) => {
        delivery = next;
      },
      () => hasSubscriptionDelivery,
      (userId) => recoveryReads.push({ resource: "deliveries", userId }),
    ),
    scheduler,
    reconciler,
  });
  return {
    application,
    delivery: () => delivery,
    setDelivery: (next: NotificationDeliveryRecord) => {
      delivery = next;
    },
    subscription: () => subscription,
    setHasSubscriptionDelivery: (value: boolean) => {
      hasSubscriptionDelivery = value;
    },
    maintenanceJobs: () => maintenanceJobs,
    deliveryJobs: () => deliveryJobs,
    reconciliations: () => reconciliations,
    recoveryReads: () => recoveryReads,
  };
}

function fakeDatabase(): Database {
  return {
    transaction: async (work: (transaction: DatabaseExecutor) => Promise<unknown>) => work(executor),
  } as unknown as Database;
}

function deliveryRecord(
  state: NotificationDeliveryRecord["state"],
  updatedAt: Date,
): NotificationDeliveryRecord {
  return {
    id: ids.delivery,
    userId: ids.user,
    reminderId: ids.reminder,
    subscriptionId: ids.subscription,
    occurrenceKey: null,
    scheduledFor: state === "scheduled" ? updatedAt : now,
    state,
    attemptCount: state === "scheduled" ? 0 : 1,
    lastErrorCode: state === "failed" ? "outcome_unknown" : null,
    deliveredAt: null,
    idempotencyKey: "a".repeat(64),
    createdAt: updatedAt,
    updatedAt,
  };
}

function subscriptionRecord(revokedAt: Date | null): PushSubscriptionRecord {
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
    revokedAt,
  };
}

function reminderRecord(): TaskReminderRecord {
  return {
    id: ids.reminder,
    userId: ids.user,
    taskId: ids.task,
    kind: "relative_start",
    remindAt: null,
    offsetMinutes: 10,
    enabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function deliveryRepository(
  read: () => NotificationDeliveryRecord | null,
  write: (record: NotificationDeliveryRecord | null) => void,
  hasSubscription: () => boolean,
  onRecoveryRead: (userId: string) => void,
): NotificationDeliveryRepository {
  return {
    findById: async (userId, deliveryId) => {
      const current = read();
      return current?.userId === userId && current.id === deliveryId ? current : null;
    },
    listByReminder: async () => (read() ? [read()!] : []),
    listBySubscription: async () => (read() ? [read()!] : []),
    insertIfAbsent: async () => {
      throw new Error("Unexpected delivery insert.");
    },
    async writeState(stateInput) {
      const current = read();
      if (
        !current ||
        current.userId !== stateInput.userId ||
        current.id !== stateInput.id ||
        current.state !== stateInput.expectedState ||
        current.attemptCount !== stateInput.expectedAttemptCount
      ) {
        return null;
      }
      const next = { ...current, ...stateInput, updatedAt: stateInput.now };
      write(next);
      return next;
    },
    async removeTerminal(userId, deliveryId, updatedBefore) {
      const current = read();
      if (
        !current ||
        current.userId !== userId ||
        current.id !== deliveryId ||
        current.updatedAt > updatedBefore
      ) {
        return false;
      }
      write(null);
      return true;
    },
    hasForSubscription: async () => hasSubscription(),
    async listRecoveryPage(userId) {
      onRecoveryRead(userId);
      const current = read();
      return current?.userId === userId ? [current] : [];
    },
  };
}

function subscriptionRepository(
  read: () => PushSubscriptionRecord | null,
  write: (record: PushSubscriptionRecord | null) => void,
  hasSubscription: () => boolean,
  onRecoveryRead: (userId: string) => void,
): PushSubscriptionRepository {
  return {
    lockRegistrationScope: async () => undefined,
    listActiveIdsUpTo: async () => {
      const current = read();
      return !current || current.revokedAt ? [] : [current.id];
    },
    findActiveByEndpointHash: async () => null,
    listActive: async () => [],
    findById: async (userId, subscriptionId) => {
      const current = read();
      return current?.userId === userId && current.id === subscriptionId ? current : null;
    },
    insert: async () => ({ kind: "endpoint_conflict" }),
    refresh: async () => null,
    revoke: async () => null,
    async removeRevoked(userId, subscriptionId, revokedBefore) {
      const current = read();
      if (
        !current?.revokedAt ||
        current.userId !== userId ||
        current.id !== subscriptionId ||
        current.revokedAt > revokedBefore ||
        hasSubscription()
      ) {
        return false;
      }
      write(null);
      return true;
    },
    async listRecoveryPage(userId) {
      onRecoveryRead(userId);
      const current = read();
      return current?.userId === userId ? [current] : [];
    },
  };
}

function reminderRepository(
  read: () => TaskReminderRecord | null,
  onRecoveryRead: (userId: string) => void,
): TaskReminderRepository {
  return {
    findByTask: async () => read(),
    findById: async (userId, reminderId) => {
      const current = read();
      return current?.userId === userId && current.id === reminderId ? current : null;
    },
    insert: async () => null,
    replace: async () => null,
    remove: async () => null,
    async listRecoveryPage(userId) {
      onRecoveryRead(userId);
      const current = read();
      return current?.userId === userId ? [current] : [];
    },
  };
}
