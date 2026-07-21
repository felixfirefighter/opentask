import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIdentityApplication } from "../../modules/identity/application/identity-application.ts";
import { DEMO_TASK_REMINDER_ID } from "../../modules/notifications/application/demo-notification-fixture.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createIdentityDatabaseFixture, identityTestAuthRuntime } from "./support/identity-test-fixture.ts";

const fixture = createIdentityDatabaseFixture("p7_demo_notifications");
const resetAt = new Date("2026-07-21T08:00:00.000Z");
const clock: Clock = { now: () => new Date(resetAt) };
let database: Database;

describe("P7 deterministic notification demo integration", () => {
  beforeAll(async () => {
    database = await fixture.setup();
  });

  afterAll(async () => fixture.teardown());

  it("replaces only the selected actor's notification data without pre-enrolling push", async () => {
    const application = createIdentityApplication({
      database,
      clock,
      authRuntime: identityTestAuthRuntime,
    });
    const first = await application.enterDemo(demoHeaders("192.0.2.81"));
    const second = await application.enterDemo(demoHeaders("192.0.2.82"));
    const firstCookie = cookiesFromSetCookie(first.setCookieHeaders);

    await expectNotificationFixture(first.actor.userId);
    await expectNotificationFixture(second.actor.userId);

    await database
      .update(schema.taskReminders)
      .set({ enabled: false, version: 2, updatedAt: resetAt })
      .where(
        and(
          eq(schema.taskReminders.userId, second.actor.userId),
          eq(schema.taskReminders.id, DEMO_TASK_REMINDER_ID),
        ),
      );
    await insertOperationalState(first.actor.userId);

    await expect(application.enterDemo(demoHeaders("192.0.2.81", firstCookie))).resolves.toMatchObject({
      mode: "reset",
      actor: first.actor,
    });

    await expectNotificationFixture(first.actor.userId);
    await expect(operationalCounts(first.actor.userId)).resolves.toEqual({
      deliveries: 0,
      subscriptions: 0,
    });
    await expect(remindersFor(second.actor.userId)).resolves.toEqual([
      expect.objectContaining({
        id: DEMO_TASK_REMINDER_ID,
        enabled: false,
        version: 2,
      }),
    ]);
  });
});

async function expectNotificationFixture(userId: string): Promise<void> {
  await expect(remindersFor(userId)).resolves.toEqual([
    expect.objectContaining({
      id: DEMO_TASK_REMINDER_ID,
      userId,
      kind: "absolute",
      remindAt: new Date("2026-07-21T10:00:00.000Z"),
      offsetMinutes: null,
      enabled: true,
      version: 1,
      createdAt: resetAt,
      updatedAt: resetAt,
    }),
  ]);
  await expect(operationalCounts(userId)).resolves.toEqual({ deliveries: 0, subscriptions: 0 });
}

async function insertOperationalState(userId: string): Promise<void> {
  const subscriptionId = randomUUID();
  await database.insert(schema.pushSubscriptions).values({
    id: subscriptionId,
    userId,
    endpointHash: Buffer.alloc(32, 1),
    endpointCiphertext: encryptedFixture("endpoint"),
    p256dhCiphertext: encryptedFixture("p256dh"),
    authCiphertext: encryptedFixture("auth"),
    encryptionKeyVersion: 1,
    deviceLabel: "Temporary browser",
    userAgentSummary: null,
    createdAt: resetAt,
    lastUsedAt: resetAt,
    revokedAt: null,
  });
  await database.insert(schema.notificationDeliveries).values({
    id: randomUUID(),
    userId,
    reminderId: DEMO_TASK_REMINDER_ID,
    subscriptionId,
    occurrenceKey: null,
    scheduledFor: new Date("2026-07-21T10:00:00.000Z"),
    state: "scheduled",
    attemptCount: 0,
    lastErrorCode: null,
    deliveredAt: null,
    idempotencyKey: "a".repeat(64),
    createdAt: resetAt,
    updatedAt: resetAt,
  });
}

function remindersFor(userId: string) {
  return database.select().from(schema.taskReminders).where(eq(schema.taskReminders.userId, userId));
}

async function operationalCounts(userId: string) {
  const [subscriptions, deliveries] = await Promise.all([
    database
      .select({ id: schema.pushSubscriptions.id })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId)),
    database
      .select({ id: schema.notificationDeliveries.id })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, userId)),
  ]);
  return { subscriptions: subscriptions.length, deliveries: deliveries.length };
}

function encryptedFixture(label: string): string {
  return `v1.AAAAAAAAAAAAAAAA.${Buffer.from(label).toString("base64url")}.BBBBBBBBBBBBBBBBBBBBBB`;
}

function demoHeaders(clientAddress: string, cookie?: string) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: identityTestAuthRuntime.baseUrl,
    "sec-fetch-site": "same-origin",
    "x-real-ip": clientAddress,
  });
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

function cookiesFromSetCookie(values: readonly string[]): string {
  return values
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}
