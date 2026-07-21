import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { PgBoss } from "pg-boss";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNotificationDeliveryRepository } from "../../modules/notifications/infrastructure/notification-delivery-repository.ts";
import {
  createPgBossNotificationJobScheduler,
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_MAINTENANCE_QUEUE,
} from "../../modules/notifications/infrastructure/pg-boss-notification-scheduler.ts";
import type { Database, DatabaseExecutor } from "../../shared/db/client.ts";
import { getTestDatabaseUrl } from "../../shared/config/environment.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p6_notification_queue");
const bossSchema = `p6boss_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
let pool: Pool;
let database: Database;
let boss: PgBoss;
let scheduler: ReturnType<typeof createPgBossNotificationJobScheduler>;
let owner: Awaited<ReturnType<typeof createOwnerGraph>>;

describe("P6 transactional notification queues", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema }) as unknown as Database;
    boss = new PgBoss({ connectionString: getTestDatabaseUrl(), schema: bossSchema });
    await boss.start();
    scheduler = createPgBossNotificationJobScheduler(boss);
    await scheduler.ensureQueues();
    owner = await createOwnerGraph();
  }, 60_000);

  afterAll(async () => {
    await boss?.stop({ graceful: true, timeout: 5_000 });
    await pool?.query(`drop schema if exists "${bossSchema}" cascade`);
    await fixture.teardown();
  });

  it("installs exactly the frozen queues without a cron schedule", async () => {
    const queues = await boss.getQueues([NOTIFICATION_DELIVERY_QUEUE, NOTIFICATION_MAINTENANCE_QUEUE]);
    expect(queues).toHaveLength(2);
    expect(queues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: NOTIFICATION_DELIVERY_QUEUE,
          expireInSeconds: 60,
          retentionSeconds: 2_678_400,
          deleteAfterSeconds: 86_400,
          retryLimit: 3,
          retryDelay: 30,
          retryBackoff: true,
          retryDelayMax: 300,
        }),
        expect.objectContaining({
          name: NOTIFICATION_MAINTENANCE_QUEUE,
          expireInSeconds: 120,
          retentionSeconds: 2_678_400,
          deleteAfterSeconds: 86_400,
          retryLimit: 1,
          retryDelay: 60,
          retryBackoff: false,
        }),
      ]),
    );
    await expect(boss.getSchedules()).resolves.toEqual([]);
  });

  it("rolls back the domain delivery and logical job together", async () => {
    const deliveryId = randomUUID();
    await expect(
      database.transaction(async (transaction) => {
        await insertDelivery(deliveryId, `rollback-${deliveryId}`, transaction);
        await scheduler.sendDelivery(
          { schemaVersion: 1, userId: owner.userId, deliveryId },
          { jobId: deliveryId, startAfter: owner.scheduledFor },
          transaction,
        );
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");

    await expect(
      pool.query<{ count: number }>(
        `select count(*)::int as count from notification_deliveries where user_id = $1 and id = $2`,
        [owner.userId, deliveryId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(boss.findJobs(NOTIFICATION_DELIVERY_QUEUE, { id: deliveryId })).resolves.toEqual([]);
  });

  it("commits one idempotent job with its delivery row", async () => {
    const deliveryId = randomUUID();
    await database.transaction(async (transaction) => {
      await insertDelivery(deliveryId, `commit-${deliveryId}`, transaction);
      const job = { schemaVersion: 1 as const, userId: owner.userId, deliveryId };
      const options = { jobId: deliveryId, startAfter: owner.scheduledFor };
      await scheduler.sendDelivery(job, options, transaction);
      await scheduler.sendDelivery(job, options, transaction);
    });

    await expect(
      pool.query<{ count: number }>(
        `select count(*)::int as count from notification_deliveries where user_id = $1 and id = $2`,
        [owner.userId, deliveryId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    const jobs = await boss.findJobs<{ schemaVersion: 1; userId: string; deliveryId: string }>(
      NOTIFICATION_DELIVERY_QUEUE,
      { id: deliveryId },
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual({ schemaVersion: 1, userId: owner.userId, deliveryId });
  });
});

async function insertDelivery(deliveryId: string, marker: string, executor: DatabaseExecutor) {
  return createNotificationDeliveryRepository().insertIfAbsent(
    {
      id: deliveryId,
      userId: owner.userId,
      reminderId: owner.reminderId,
      subscriptionId: owner.subscriptionId,
      occurrenceKey: null,
      scheduledFor: owner.scheduledFor,
      idempotencyKey: Buffer.from(marker).toString("hex").padEnd(64, "0").slice(0, 64),
      now: new Date("2026-07-21T10:00:00.000Z"),
    },
    executor,
  );
}

async function createOwnerGraph() {
  const userId = await insertUser(pool, "p6-queue-owner");
  const listId = randomUUID();
  const taskId = randomUUID();
  const reminderId = randomUUID();
  const subscriptionId = randomUUID();
  const scheduledFor = new Date("2026-07-22T10:00:00.000Z");
  await pool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, 'Queue list', 'slate', 'a0', 'regular')`,
    [listId, userId],
  );
  await pool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank)
     values ($1, $2, $3, 'Queue task', '', 'a0')`,
    [taskId, userId, listId],
  );
  await pool.query(
    `insert into task_reminders (id, user_id, task_id, kind, remind_at)
     values ($1, $2, $3, 'absolute', $4)`,
    [reminderId, userId, taskId, scheduledFor],
  );
  const envelope = `v1.${"A".repeat(16)}.${"B".repeat(2)}.${"C".repeat(22)}`;
  await pool.query(
    `insert into push_subscriptions
       (id, user_id, endpoint_hash, endpoint_ciphertext, p256dh_ciphertext,
        auth_ciphertext, encryption_key_version)
     values ($1, $2, $3, $4, $4, $4, 0)`,
    [subscriptionId, userId, Buffer.alloc(32, 4), envelope],
  );
  return { userId, reminderId, subscriptionId, scheduledFor } as const;
}
