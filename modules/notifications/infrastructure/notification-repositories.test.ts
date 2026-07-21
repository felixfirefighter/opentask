import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";

import { createNotificationDeliveryRepository } from "./notification-delivery-repository";
import { createPushSubscriptionRepository } from "./push-subscription-repository";
import { createTaskReminderRepository } from "./task-reminder-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";
const relatedId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-21T01:02:03.000Z");

type CapturedQuery = { sql: string; params: unknown[]; method: string };

function createRecorder() {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params, method) => {
    queries.push({ sql, params, method });
    return { rows: [] };
  };
  return {
    queries,
    executor: createProxyDatabase(callback) as unknown as DatabaseExecutor,
  };
}

describe("notification repository SQL", () => {
  it("scopes every reminder read, lock, mutation, and recovery page to the actor", async () => {
    const recorder = createRecorder();
    const repository = createTaskReminderRepository();
    await repository.findByTask(userId, relatedId, recorder.executor, true);
    await repository.findById(userId, recordId, recorder.executor);
    await repository.insert(
      {
        id: recordId,
        userId,
        taskId: relatedId,
        kind: "relative_start",
        remindAt: null,
        offsetMinutes: 15,
        enabled: true,
        now,
      },
      recorder.executor,
    );
    await repository.replace(
      {
        userId,
        taskId: relatedId,
        expectedVersion: 2,
        kind: "absolute",
        remindAt: new Date("2026-07-22T01:02:03.000Z"),
        offsetMinutes: null,
        enabled: true,
        now,
      },
      recorder.executor,
    );
    await repository.remove(userId, relatedId, 3, recorder.executor);
    await repository.listRecoveryPage(userId, recordId, 100, recorder.executor);

    expect(recorder.queries).toHaveLength(6);
    for (const query of recorder.queries) expect(query.params).toContain(userId);
    expect(recorder.queries[0]?.sql).toContain("for update");
    expect(recorder.queries[3]?.sql).toContain('"task_reminders"."version" =');
    expect(recorder.queries[5]?.sql).toContain('"task_reminders"."id" >');
    expect(recorder.queries[5]?.sql).toContain('order by "task_reminders"."id" asc');
  });

  it("maps a global subscription insert conflict generically using only an actor-owned ID check", async () => {
    const recorder = createRecorder();
    const repository = createPushSubscriptionRepository();
    const result = await repository.insert(
      {
        id: recordId,
        userId,
        endpointHash: new Uint8Array(32),
        endpointCiphertext: validEnvelope("endpoint"),
        p256dhCiphertext: validEnvelope("p256dh"),
        authCiphertext: validEnvelope("auth"),
        encryptionKeyVersion: 0,
        deviceLabel: null,
        userAgentSummary: null,
        now,
      },
      recorder.executor,
    );

    expect(result).toEqual({ kind: "endpoint_conflict" });
    expect(recorder.queries).toHaveLength(2);
    expect(recorder.queries[1]?.sql).toContain('"push_subscriptions"."user_id" =');
    expect(recorder.queries[1]?.sql).toContain('"push_subscriptions"."id" =');
    expect(recorder.queries[1]?.sql).not.toContain("endpoint_hash");
    expect(recorder.queries[1]?.params).toEqual(expect.arrayContaining([userId, recordId]));
  });

  it("takes an actor-scoped transaction lock before the bounded active-subscription probe", async () => {
    const recorder = createRecorder();
    const repository = createPushSubscriptionRepository();

    await repository.lockRegistrationScope(userId, recorder.executor);
    await repository.listActiveIdsUpTo(userId, 10, recorder.executor);

    expect(recorder.queries).toHaveLength(2);
    expect(recorder.queries[0]?.sql).toContain("pg_advisory_xact_lock");
    expect(recorder.queries[0]?.sql).toContain("hashtextextended");
    expect(recorder.queries[0]?.params).toContain(
      `opentask:notifications:subscription-registration:${userId}`,
    );
    expect(recorder.queries[1]?.sql).toContain('"push_subscriptions"."user_id" =');
    expect(recorder.queries[1]?.sql).toContain('"push_subscriptions"."revoked_at" is null');
    expect(recorder.queries[1]?.sql).toContain('order by "push_subscriptions"."last_used_at" desc');
    expect(recorder.queries[1]?.params).toEqual(expect.arrayContaining([userId, 10]));
  });

  it("keeps subscription reads, revocation, dependency-safe cleanup, and recovery actor-scoped", async () => {
    const recorder = createRecorder();
    const repository = createPushSubscriptionRepository();
    await repository.findActiveByEndpointHash(userId, new Uint8Array(32), recorder.executor, true);
    await repository.listActive(userId, recorder.executor, true);
    await repository.findById(userId, recordId, recorder.executor);
    await repository.refresh(
      {
        userId,
        id: recordId,
        endpointCiphertext: validEnvelope("endpoint"),
        p256dhCiphertext: validEnvelope("p256dh"),
        authCiphertext: validEnvelope("auth"),
        encryptionKeyVersion: 1,
        deviceLabel: "Browser",
        userAgentSummary: "Agent",
        now,
      },
      recorder.executor,
    );
    await repository.revoke(userId, recordId, now, recorder.executor);
    await repository.removeRevoked(userId, recordId, now, recorder.executor);
    await repository.listRecoveryPage(userId, recordId, 100, recorder.executor);

    for (const query of recorder.queries) expect(query.params).toContain(userId);
    expect(recorder.queries[0]?.sql).toContain("for update");
    expect(recorder.queries[1]?.sql).toContain("for update");
    expect(recorder.queries[5]?.sql).toContain("not exists");
    expect(recorder.queries[5]?.params.filter((value) => value === userId)).toHaveLength(2);
  });

  it("scopes all delivery access and state transitions to the actor and expected state", async () => {
    const recorder = createRecorder();
    const repository = createNotificationDeliveryRepository();
    await repository.findById(userId, recordId, recorder.executor, true);
    await repository.listByReminder(userId, relatedId, recorder.executor, true);
    await repository.listBySubscription(userId, relatedId, recorder.executor, true);
    await repository.writeState(
      {
        userId,
        id: recordId,
        expectedState: "scheduled",
        expectedAttemptCount: 0,
        state: "delivering",
        attemptCount: 1,
        lastErrorCode: null,
        deliveredAt: null,
        now,
      },
      recorder.executor,
    );
    await repository.removeTerminal(userId, recordId, now, recorder.executor);
    await repository.hasForSubscription(userId, relatedId, recorder.executor);
    await repository.listRecoveryPage(userId, recordId, 100, recorder.executor);

    for (const query of recorder.queries) expect(query.params).toContain(userId);
    expect(recorder.queries.slice(0, 3).every(({ sql }) => sql.includes("for update"))).toBe(true);
    expect(recorder.queries[3]?.sql).toContain('"notification_deliveries"."state" =');
    expect(recorder.queries[3]?.sql).toContain('"notification_deliveries"."attempt_count" =');
    expect(recorder.queries[4]?.sql).toContain("in");
    expect(recorder.queries[6]?.sql).toContain('"notification_deliveries"."id" >');
  });

  it("rejects recovery pages and cap probes above their frozen actor-only bounds before querying", async () => {
    const recorder = createRecorder();
    await expect(
      createTaskReminderRepository().listRecoveryPage(userId, null, 101, recorder.executor),
    ).rejects.toThrow(RangeError);
    await expect(
      createPushSubscriptionRepository().listRecoveryPage(userId, null, 0, recorder.executor),
    ).rejects.toThrow(RangeError);
    await expect(
      createNotificationDeliveryRepository().listRecoveryPage(userId, null, 101, recorder.executor),
    ).rejects.toThrow(RangeError);
    await expect(
      createPushSubscriptionRepository().listActiveIdsUpTo(userId, 11, recorder.executor),
    ).rejects.toThrow(RangeError);
    expect(recorder.queries).toEqual([]);
  });
});

function validEnvelope(value: string): string {
  return `v1.${Buffer.alloc(12).toString("base64url")}.${Buffer.from(value).toString("base64url")}.${Buffer.alloc(16).toString("base64url")}`;
}
