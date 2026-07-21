import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAesSubscriptionCipher } from "../../modules/notifications/infrastructure/aes-subscription-cipher.ts";
import { createNodeNotificationDigest } from "../../modules/notifications/infrastructure/node-notification-digest.ts";
import { createNotificationDeliveryRepository } from "../../modules/notifications/infrastructure/notification-delivery-repository.ts";
import { createPushSubscriptionRepository } from "../../modules/notifications/infrastructure/push-subscription-repository.ts";
import { createTaskReminderRepository } from "../../modules/notifications/infrastructure/task-reminder-repository.ts";
import type { DatabaseExecutor } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p6_notification_repositories");
let pool: Pool;
let database: DatabaseExecutor;

const reminders = createTaskReminderRepository();
const subscriptions = createPushSubscriptionRepository();
const deliveries = createNotificationDeliveryRepository();
const digest = createNodeNotificationDigest();
const encryption = { activeKeyVersion: 2, keys: new Map([[2, Buffer.alloc(32, 9)]]) } as const;
const cipher = createAesSubscriptionCipher(encryption);

describe("P6 actor-scoped notification persistence", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema }) as unknown as DatabaseExecutor;
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("stores provider material encrypted and maps a cross-account endpoint conflict generically", async () => {
    const ownerId = await insertUser(pool, "p6-subscription-owner");
    const strangerId = await insertUser(pool, "p6-subscription-stranger");
    const endpoint = "https://push.example.test/private-endpoint-token";
    const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString("base64url");
    const auth = Buffer.alloc(16, 3).toString("base64url");
    const endpointHash = digest.sha256Bytes(endpoint);
    const subscriptionId = randomUUID();
    const material = encryptSubscription(ownerId, subscriptionId, { endpoint, p256dh, auth });

    await expect(
      subscriptions.insert(
        {
          id: subscriptionId,
          userId: ownerId,
          endpointHash,
          ...material,
          deviceLabel: "Laptop",
          userAgentSummary: "Test browser",
          now: new Date("2026-07-21T01:00:00.000Z"),
        },
        database,
      ),
    ).resolves.toMatchObject({ kind: "inserted" });

    const conflictingId = randomUUID();
    await expect(
      subscriptions.insert(
        {
          id: conflictingId,
          userId: strangerId,
          endpointHash,
          ...encryptSubscription(strangerId, conflictingId, { endpoint, p256dh, auth }),
          deviceLabel: null,
          userAgentSummary: null,
          now: new Date("2026-07-21T01:01:00.000Z"),
        },
        database,
      ),
    ).resolves.toEqual({ kind: "endpoint_conflict" });
    await expect(
      subscriptions.findActiveByEndpointHash(strangerId, endpointHash, database),
    ).resolves.toBeNull();

    const raw = await pool.query<{
      user_id: string;
      endpoint_ciphertext: string;
      p256dh_ciphertext: string;
      auth_ciphertext: string;
      revoked_at: Date | null;
    }>(
      `select user_id, endpoint_ciphertext, p256dh_ciphertext, auth_ciphertext, revoked_at
         from push_subscriptions where endpoint_hash = $1`,
      [Buffer.from(endpointHash)],
    );
    expect(raw.rows).toHaveLength(1);
    expect(raw.rows[0]).toMatchObject({ user_id: ownerId, revoked_at: null });
    expect(JSON.stringify(raw.rows[0])).not.toContain(endpoint);
    expect(JSON.stringify(raw.rows[0])).not.toContain(p256dh);
    expect(JSON.stringify(raw.rows[0])).not.toContain(auth);
  });

  it("does not read, replace, or remove another actor's reminder", async () => {
    const ownerId = await insertUser(pool, "p6-reminder-owner");
    const strangerId = await insertUser(pool, "p6-reminder-stranger");
    const taskId = await insertTask(ownerId, "Reminder task");
    const reminderId = randomUUID();
    await reminders.insert(
      {
        id: reminderId,
        userId: ownerId,
        taskId,
        kind: "absolute",
        remindAt: new Date("2026-07-22T10:00:00.000Z"),
        offsetMinutes: null,
        enabled: true,
        now: new Date("2026-07-21T10:00:00.000Z"),
      },
      database,
    );

    await expect(reminders.findById(strangerId, reminderId, database)).resolves.toBeNull();
    await expect(reminders.findByTask(strangerId, taskId, database)).resolves.toBeNull();
    await expect(
      reminders.replace(
        {
          userId: strangerId,
          taskId,
          expectedVersion: 1,
          kind: "absolute",
          remindAt: new Date("2026-07-22T11:00:00.000Z"),
          offsetMinutes: null,
          enabled: true,
          now: new Date("2026-07-21T11:00:00.000Z"),
        },
        database,
      ),
    ).resolves.toBeNull();
    await expect(reminders.remove(strangerId, taskId, 1, database)).resolves.toBeNull();
    await expect(reminders.findById(ownerId, reminderId, database)).resolves.toMatchObject({
      userId: ownerId,
      version: 1,
      enabled: true,
    });
  });

  it("deduplicates logical deliveries and allows only one concurrent worker claim", async () => {
    const userId = await insertUser(pool, "p6-delivery-owner");
    const strangerId = await insertUser(pool, "p6-delivery-stranger");
    const taskId = await insertTask(userId, "Delivery task");
    const reminderId = randomUUID();
    await reminders.insert(
      {
        id: reminderId,
        userId,
        taskId,
        kind: "absolute",
        remindAt: new Date("2026-07-22T10:00:00.000Z"),
        offsetMinutes: null,
        enabled: true,
        now: new Date("2026-07-21T10:00:00.000Z"),
      },
      database,
    );
    const subscriptionId = randomUUID();
    const endpoint = `https://push.example.test/${randomUUID()}`;
    await subscriptions.insert(
      {
        id: subscriptionId,
        userId,
        endpointHash: digest.sha256Bytes(endpoint),
        ...encryptSubscription(userId, subscriptionId, {
          endpoint,
          p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 4)]).toString("base64url"),
          auth: Buffer.alloc(16, 5).toString("base64url"),
        }),
        deviceLabel: null,
        userAgentSummary: null,
        now: new Date("2026-07-21T10:00:00.000Z"),
      },
      database,
    );

    const scheduledFor = new Date("2026-07-22T10:00:00.000Z");
    const idempotencyKey = digest.sha256Hex(`fixture\0${userId}\0${reminderId}\0${subscriptionId}`);
    const concurrent = await Promise.all([
      deliveries.insertIfAbsent(
        {
          id: randomUUID(),
          userId,
          reminderId,
          subscriptionId,
          occurrenceKey: null,
          scheduledFor,
          idempotencyKey,
          now: new Date("2026-07-21T10:00:00.000Z"),
        },
        database,
      ),
      deliveries.insertIfAbsent(
        {
          id: randomUUID(),
          userId,
          reminderId,
          subscriptionId,
          occurrenceKey: null,
          scheduledFor,
          idempotencyKey,
          now: new Date("2026-07-21T10:00:00.000Z"),
        },
        database,
      ),
    ]);
    expect(concurrent.map(({ inserted }) => inserted).sort()).toEqual([false, true]);
    expect(concurrent[0]?.delivery.id).toBe(concurrent[1]?.delivery.id);
    const deliveryId = concurrent[0]!.delivery.id;
    await expect(deliveries.findById(strangerId, deliveryId, database)).resolves.toBeNull();

    const claims = await Promise.all([
      deliveries.writeState(
        {
          userId,
          id: deliveryId,
          expectedState: "scheduled",
          expectedAttemptCount: 0,
          state: "delivering",
          attemptCount: 1,
          lastErrorCode: null,
          deliveredAt: null,
          now: new Date("2026-07-22T10:00:00.000Z"),
        },
        database,
      ),
      deliveries.writeState(
        {
          userId,
          id: deliveryId,
          expectedState: "scheduled",
          expectedAttemptCount: 0,
          state: "delivering",
          attemptCount: 1,
          lastErrorCode: null,
          deliveredAt: null,
          now: new Date("2026-07-22T10:00:00.000Z"),
        },
        database,
      ),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});

function encryptSubscription(
  userId: string,
  subscriptionId: string,
  material: Readonly<{ endpoint: string; p256dh: string; auth: string }>,
) {
  const common = { userId, subscriptionId, keyVersion: 2 } as const;
  return {
    endpointCiphertext: cipher.encrypt({ ...common, field: "endpoint", plaintext: material.endpoint }),
    p256dhCiphertext: cipher.encrypt({ ...common, field: "p256dh", plaintext: material.p256dh }),
    authCiphertext: cipher.encrypt({ ...common, field: "auth", plaintext: material.auth }),
    encryptionKeyVersion: 2,
  } as const;
}

async function insertTask(userId: string, title: string): Promise<string> {
  const listId = randomUUID();
  const taskId = randomUUID();
  await pool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, $3, 'slate', 'a0', 'regular')`,
    [listId, userId, `${title} list`],
  );
  await pool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank)
     values ($1, $2, $3, $4, '', 'a0')`,
    [taskId, userId, listId, title],
  );
  return taskId;
}
