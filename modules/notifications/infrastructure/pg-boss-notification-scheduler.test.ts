import { describe, expect, it, vi } from "vitest";
import type { Db, PgBoss, QueueResult } from "pg-boss";

import type { DatabaseExecutor } from "@/shared/db/client";

import {
  createPgBossNotificationJobScheduler,
  createStartingPgBossNotificationJobScheduler,
  deterministicMaintenanceJobId,
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_MAINTENANCE_QUEUE,
  NotificationQueueConfigurationError,
} from "./pg-boss-notification-scheduler";

const userId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "22222222-2222-4222-8222-222222222222";
const startAfter = new Date("2026-07-21T10:30:00.000Z");
const database = { executeSql: vi.fn() } as unknown as Db;
const executor = {} as DatabaseExecutor;

describe("pg-boss notification scheduler", () => {
  it("creates and verifies exactly the two frozen queue definitions", async () => {
    const boss = createBossMock();
    const scheduler = createPgBossNotificationJobScheduler(boss, () => database);

    await Promise.all([scheduler.ensureQueues(), scheduler.ensureQueues()]);
    expect(boss.createQueue).toHaveBeenCalledTimes(2);
    expect(boss.createQueue).toHaveBeenNthCalledWith(1, NOTIFICATION_DELIVERY_QUEUE, {
      policy: "standard",
      expireInSeconds: 60,
      retentionSeconds: 2_678_400,
      deleteAfterSeconds: 86_400,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 300,
    });
    expect(boss.createQueue).toHaveBeenNthCalledWith(2, NOTIFICATION_MAINTENANCE_QUEUE, {
      policy: "standard",
      expireInSeconds: 120,
      retentionSeconds: 2_678_400,
      deleteAfterSeconds: 86_400,
      retryLimit: 1,
      retryDelay: 60,
      retryBackoff: false,
    });
  });

  it("rejects queue-definition drift instead of silently changing it", async () => {
    const boss = createBossMock({ retryLimit: 99 });
    const scheduler = createPgBossNotificationJobScheduler(boss, () => database);
    await expect(scheduler.ensureQueues()).rejects.toEqual(
      expect.objectContaining<Partial<NotificationQueueConfigurationError>>({
        name: "NotificationQueueConfigurationError",
        queueName: NOTIFICATION_DELIVERY_QUEUE,
      }),
    );
  });

  it("inserts delivery and maintenance jobs through the caller transaction only", async () => {
    const boss = createBossMock();
    const transactionAdapter = vi.fn(() => database);
    const scheduler = createPgBossNotificationJobScheduler(boss, transactionAdapter);
    await scheduler.sendDelivery(
      { schemaVersion: 1, userId, deliveryId },
      { jobId: deliveryId, startAfter },
      executor,
    );
    const dedupeKey = `notification-delivery-cleanup:${userId}:${deliveryId}:${startAfter.toISOString()}`;
    await scheduler.sendMaintenance(
      { schemaVersion: 1, userId, kind: "delivery_cleanup", deliveryId },
      { dedupeKey, startAfter },
      executor,
    );

    expect(transactionAdapter).toHaveBeenCalledTimes(2);
    expect(transactionAdapter).toHaveBeenCalledWith(executor);
    expect(boss.send).toHaveBeenNthCalledWith(
      1,
      NOTIFICATION_DELIVERY_QUEUE,
      { schemaVersion: 1, userId, deliveryId },
      { id: deliveryId, startAfter, db: database },
    );
    expect(boss.send).toHaveBeenNthCalledWith(
      2,
      NOTIFICATION_MAINTENANCE_QUEUE,
      { schemaVersion: 1, userId, kind: "delivery_cleanup", deliveryId },
      { id: deterministicMaintenanceJobId(dedupeKey), startAfter, db: database },
    );
  });

  it("uses stable UUID-shaped maintenance IDs without leaking the dedupe key", () => {
    const secretishKey = "notification-actor-recovery:opaque-user:2026-07-21T10:30Z";
    const first = deterministicMaintenanceJobId(secretishKey);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(deterministicMaintenanceJobId(secretishKey)).toBe(first);
    expect(deterministicMaintenanceJobId(`${secretishKey}:next`)).not.toBe(first);
    expect(first).not.toContain("opaque-user");
  });

  it("strictly rejects extra durable payload fields", async () => {
    const boss = createBossMock();
    const scheduler = createPgBossNotificationJobScheduler(boss, () => database);
    await expect(
      scheduler.sendDelivery(
        { schemaVersion: 1, userId, deliveryId, endpoint: "must-not-persist" } as never,
        { jobId: deliveryId, startAfter },
        executor,
      ),
    ).rejects.toThrow();
    expect(boss.send).not.toHaveBeenCalled();
  });

  it("requires the queue job ID to equal the delivery ID", async () => {
    const boss = createBossMock();
    const scheduler = createPgBossNotificationJobScheduler(boss, () => database);
    await expect(
      scheduler.sendDelivery(
        { schemaVersion: 1, userId, deliveryId },
        { jobId: userId, startAfter },
        executor,
      ),
    ).rejects.toThrow("Notification job payload is invalid");
    expect(boss.send).not.toHaveBeenCalled();
  });

  it("starts a web producer once before queue preparation and rejects transaction sends before it", async () => {
    const base = createBossMock();
    const boss = {
      ...base,
      start: vi.fn(async function start() {
        return boss;
      }),
    } as unknown as PgBoss & typeof base & { start: ReturnType<typeof vi.fn> };
    const scheduler = createStartingPgBossNotificationJobScheduler(boss, () => database);

    await expect(
      scheduler.sendDelivery(
        { schemaVersion: 1, userId, deliveryId },
        { jobId: deliveryId, startAfter },
        executor,
      ),
    ).rejects.toThrow("Notification producer was not prepared");
    await Promise.all([scheduler.ensureQueues(), scheduler.ensureQueues()]);
    expect(boss.start).toHaveBeenCalledTimes(1);
    await expect(
      scheduler.sendDelivery(
        { schemaVersion: 1, userId, deliveryId },
        { jobId: deliveryId, startAfter },
        executor,
      ),
    ).resolves.toBeUndefined();
  });
});

function createBossMock(deliveryOverrides: Partial<QueueResult> = {}) {
  const queue = (name: string): QueueResult => ({
    name,
    policy: "standard",
    retryLimit: name === NOTIFICATION_DELIVERY_QUEUE ? 3 : 1,
    retryDelay: name === NOTIFICATION_DELIVERY_QUEUE ? 30 : 60,
    retryBackoff: name === NOTIFICATION_DELIVERY_QUEUE,
    ...(name === NOTIFICATION_DELIVERY_QUEUE ? { retryDelayMax: 300 } : {}),
    expireInSeconds: name === NOTIFICATION_DELIVERY_QUEUE ? 60 : 120,
    retentionSeconds: 2_678_400,
    deleteAfterSeconds: 86_400,
    deferredCount: 0,
    queuedCount: 0,
    readyCount: 0,
    activeCount: 0,
    failedCount: 0,
    totalCount: 0,
    table: "job_common",
    createdOn: startAfter,
    updatedOn: startAfter,
    singletonsActive: null,
    ...(name === NOTIFICATION_DELIVERY_QUEUE ? deliveryOverrides : {}),
  });
  return {
    createQueue: vi.fn(async () => undefined),
    getQueue: vi.fn(async (name: string) => queue(name)),
    send: vi.fn(async () => deliveryId),
  } as unknown as Pick<PgBoss, "createQueue" | "getQueue" | "send"> & {
    createQueue: ReturnType<typeof vi.fn>;
    getQueue: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}
