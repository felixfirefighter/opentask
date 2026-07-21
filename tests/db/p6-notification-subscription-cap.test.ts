import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSubscriptionApplication } from "../../modules/notifications/application/subscription-application.ts";
import type {
  NotificationDeliveryRepository,
  NotificationJobScheduler,
} from "../../modules/notifications/application/notification-ports.ts";
import { ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX } from "../../modules/notifications/domain/notification-limits.ts";
import { createAesSubscriptionCipher } from "../../modules/notifications/infrastructure/aes-subscription-cipher.ts";
import { createNodeNotificationDigest } from "../../modules/notifications/infrastructure/node-notification-digest.ts";
import { createPushSubscriptionRepository } from "../../modules/notifications/infrastructure/push-subscription-repository.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p6_notification_subscription_cap");
let pool: Pool;
let database: Database;

describe("P6 atomic active push-subscription cap", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema }) as unknown as Database;
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("admits only one concurrent final slot and still refreshes an existing endpoint at the cap", async () => {
    const userId = await insertUser(pool, "p6-subscription-cap-owner");
    const application = createSubscriptionApplication({
      database,
      clock: { now: () => new Date("2026-07-21T01:02:03.000Z") },
      subscriptions: createPushSubscriptionRepository(),
      deliveries: {} as NotificationDeliveryRepository,
      cipher: createAesSubscriptionCipher({
        activeKeyVersion: 1,
        keys: new Map([[1, Buffer.alloc(32, 9)]]),
      }),
      digest: createNodeNotificationDigest(),
      scheduler: inertScheduler(),
    });
    const actor = { userId };
    const existing = Array.from({ length: ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX - 1 }, (_, index) =>
      subscriptionInput(`seed-${index}`),
    );

    const registrations = [];
    for (const input of existing) {
      registrations.push(await application.registerPushSubscription(actor, input));
    }

    const contenders = await Promise.allSettled([
      application.registerPushSubscription(actor, subscriptionInput("contender-a")),
      application.registerPushSubscription(actor, subscriptionInput("contender-b")),
    ]);
    expect(contenders.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejection = contenders.find(({ status }) => status === "rejected");
    expect(rejection).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
    await expectActiveCount(userId, ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX);

    const refreshed = await application.registerPushSubscription(actor, {
      ...existing[0]!,
      id: randomUUID(),
      deviceLabel: "Refreshed browser",
    });
    const firstRegistration = registrations[0]!;
    expect(firstRegistration.status).toBe("subscribed");
    if (firstRegistration.status !== "subscribed") throw new Error("Seed registration was reset.");
    expect(refreshed).toEqual({
      status: "subscribed",
      subscriptionId: firstRegistration.subscriptionId,
    });
    await expectActiveCount(userId, ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX);
  });
});

function subscriptionInput(label: string) {
  return {
    id: randomUUID(),
    endpoint: `https://push.example.test/${label}-${randomUUID()}`,
    keys: {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString("base64url"),
      auth: Buffer.alloc(16, 3).toString("base64url"),
    },
    deviceLabel: label,
  };
}

function inertScheduler(): NotificationJobScheduler {
  return {
    async ensureQueues() {},
    async sendDelivery() {},
    async sendMaintenance() {},
  };
}

async function expectActiveCount(userId: string, expected: number): Promise<void> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from push_subscriptions
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  expect(Number(result.rows[0]?.count)).toBe(expected);
}
