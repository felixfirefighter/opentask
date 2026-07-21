import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";

import { createSubscriptionApplication } from "./subscription-application";
import type { PushSubscriptionRecord } from "./notification-records";
import type {
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushSubscriptionRepository,
} from "./notification-ports";
import { ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX } from "../domain/notification-limits";
import { createAesSubscriptionCipher } from "../infrastructure/aes-subscription-cipher";
import { createNodeNotificationDigest } from "../infrastructure/node-notification-digest";

const actor: AuthenticatedActor = { userId: "11111111-1111-4111-8111-111111111111" };
const now = new Date("2026-07-21T01:02:03.000Z");
const endpoint = "https://push.example.test/browser-one";
const input = {
  id: "22222222-2222-4222-8222-222222222222",
  endpoint,
  keys: {
    p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString("base64url"),
    auth: Buffer.alloc(16, 3).toString("base64url"),
  },
} as const;

describe("push subscription registration limits", () => {
  it("rejects a new endpoint once the atomic active-subscription cap is reached", async () => {
    const harness = createHarness(null, ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX);

    await expect(harness.application.registerPushSubscription(actor, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(harness.repository.lockRegistrationScope).toHaveBeenCalledWith(actor.userId, harness.executor);
    expect(harness.repository.listActiveIdsUpTo).toHaveBeenCalledWith(
      actor.userId,
      ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX,
      harness.executor,
    );
    expect(harness.repository.insert).not.toHaveBeenCalled();
  });

  it("refreshes the same endpoint at the cap without consuming another slot", async () => {
    const current = subscriptionRecord();
    const harness = createHarness(current, ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX);

    await expect(harness.application.registerPushSubscription(actor, input)).resolves.toEqual({
      status: "subscribed",
      subscriptionId: current.id,
    });

    expect(harness.repository.lockRegistrationScope).toHaveBeenCalledWith(actor.userId, harness.executor);
    expect(harness.repository.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor.userId, id: current.id }),
      harness.executor,
    );
    expect(harness.repository.listActiveIdsUpTo).not.toHaveBeenCalled();
    expect(harness.repository.insert).not.toHaveBeenCalled();
  });
});

function createHarness(current: PushSubscriptionRecord | null, activeCount: number) {
  const executor = {} as DatabaseExecutor;
  const repository = {
    lockRegistrationScope: vi.fn(async () => undefined),
    listActiveIdsUpTo: vi.fn(async () =>
      Array.from(
        { length: activeCount },
        (_, index) => `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`,
      ),
    ),
    findActiveByEndpointHash: vi.fn(async () => current),
    refresh: vi.fn(async () => current),
    insert: vi.fn(async () => ({ kind: "id_conflict" as const })),
  } as unknown as PushSubscriptionRepository & {
    lockRegistrationScope: ReturnType<typeof vi.fn>;
    listActiveIdsUpTo: ReturnType<typeof vi.fn>;
    findActiveByEndpointHash: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
  const scheduler = {
    ensureQueues: vi.fn(async () => undefined),
    sendDelivery: vi.fn(async () => undefined),
    sendMaintenance: vi.fn(async () => undefined),
  } satisfies NotificationJobScheduler;
  const database = {
    transaction: async <T>(work: (transaction: DatabaseExecutor) => Promise<T>) => work(executor),
  } as unknown as Database;
  const application = createSubscriptionApplication({
    database,
    clock: { now: () => now },
    subscriptions: repository,
    deliveries: {} as NotificationDeliveryRepository,
    cipher: createAesSubscriptionCipher({
      activeKeyVersion: 1,
      keys: new Map([[1, Buffer.alloc(32, 9)]]),
    }),
    digest: createNodeNotificationDigest(),
    scheduler,
  });
  return { application, executor, repository };
}

function subscriptionRecord(): PushSubscriptionRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    userId: actor.userId,
    endpointHash: createNodeNotificationDigest().sha256Bytes(endpoint),
    endpointCiphertext: "encrypted-endpoint",
    p256dhCiphertext: "encrypted-p256dh",
    authCiphertext: "encrypted-auth",
    encryptionKeyVersion: 1,
    deviceLabel: null,
    userAgentSummary: null,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
  };
}
