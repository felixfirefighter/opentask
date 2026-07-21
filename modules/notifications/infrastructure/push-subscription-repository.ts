import { and, asc, desc, eq, gt, isNotNull, isNull, lte, notExists, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX } from "../domain/notification-limits";

type SubscriptionRow = typeof schema.pushSubscriptions.$inferSelect;
export type StoredPushSubscription = Omit<SubscriptionRow, "endpointHash"> & {
  endpointHash: Uint8Array;
};
export type InsertStoredPushSubscriptionResult =
  | { kind: "inserted"; subscription: StoredPushSubscription }
  | { kind: "endpoint_conflict" }
  | { kind: "id_conflict" };

type PushSubscriptionRepositoryAdapter = Readonly<{
  lockRegistrationScope(userId: string, executor: DatabaseExecutor): Promise<void>;
  listActiveIdsUpTo(userId: string, limit: number, executor: DatabaseExecutor): Promise<readonly string[]>;
  findActiveByEndpointHash(
    userId: string,
    endpointHash: Uint8Array,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<StoredPushSubscription | null>;
  listActive(
    userId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<readonly StoredPushSubscription[]>;
  findById(
    userId: string,
    subscriptionId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<StoredPushSubscription | null>;
  insert(
    input: Readonly<{
      id: string;
      userId: string;
      endpointHash: Uint8Array;
      endpointCiphertext: string;
      p256dhCiphertext: string;
      authCiphertext: string;
      encryptionKeyVersion: number;
      deviceLabel: string | null;
      userAgentSummary: string | null;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<InsertStoredPushSubscriptionResult>;
  refresh(
    input: Readonly<{
      userId: string;
      id: string;
      endpointCiphertext: string;
      p256dhCiphertext: string;
      authCiphertext: string;
      encryptionKeyVersion: number;
      deviceLabel: string | null;
      userAgentSummary: string | null;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<StoredPushSubscription | null>;
  revoke(
    userId: string,
    subscriptionId: string,
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<StoredPushSubscription | null>;
  removeRevoked(
    userId: string,
    subscriptionId: string,
    revokedBefore: Date,
    executor: DatabaseExecutor,
  ): Promise<boolean>;
  listRecoveryPage(
    userId: string,
    afterId: string | null,
    limit: number,
    executor: DatabaseExecutor,
  ): Promise<readonly StoredPushSubscription[]>;
}>;

export function createPushSubscriptionRepository(): PushSubscriptionRepositoryAdapter {
  return {
    async lockRegistrationScope(userId, executor) {
      await executor.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`opentask:notifications:subscription-registration:${userId}`}, 0))`,
      );
    },

    async listActiveIdsUpTo(userId, limit, executor) {
      assertActiveProbeLimit(limit);
      const rows = await executor
        .select({ id: schema.pushSubscriptions.id })
        .from(schema.pushSubscriptions)
        .where(and(eq(schema.pushSubscriptions.userId, userId), isNull(schema.pushSubscriptions.revokedAt)))
        .orderBy(desc(schema.pushSubscriptions.lastUsedAt), asc(schema.pushSubscriptions.id))
        .limit(limit);
      return rows.map(({ id }) => id);
    },

    async findActiveByEndpointHash(userId, endpointHash, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.pushSubscriptions)
        .where(
          and(
            eq(schema.pushSubscriptions.userId, userId),
            eq(schema.pushSubscriptions.endpointHash, Buffer.from(endpointHash)),
            isNull(schema.pushSubscriptions.revokedAt),
          ),
        )
        .limit(1);
      const [row] = lock ? await query.for("update") : await query;
      return row ? mapSubscription(row) : null;
    },

    async listActive(userId, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.pushSubscriptions)
        .where(and(eq(schema.pushSubscriptions.userId, userId), isNull(schema.pushSubscriptions.revokedAt)))
        .orderBy(desc(schema.pushSubscriptions.lastUsedAt), asc(schema.pushSubscriptions.id));
      const rows = lock ? await query.for("update") : await query;
      return rows.map(mapSubscription);
    },

    async findById(userId, subscriptionId, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.pushSubscriptions)
        .where(
          and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.id, subscriptionId)),
        )
        .limit(1);
      const [row] = lock ? await query.for("update") : await query;
      return row ? mapSubscription(row) : null;
    },

    async insert(input, executor): Promise<InsertStoredPushSubscriptionResult> {
      const [row] = await executor
        .insert(schema.pushSubscriptions)
        .values({
          ...input,
          endpointHash: Buffer.from(input.endpointHash),
          createdAt: input.now,
          lastUsedAt: input.now,
          revokedAt: null,
        })
        .onConflictDoNothing()
        .returning();
      if (row) return { kind: "inserted", subscription: mapSubscription(row) };

      // This actor-scoped check distinguishes a reused client ID. If it misses, the only expected
      // remaining conflict is the global active-endpoint index, which stays intentionally opaque.
      const [ownedId] = await executor
        .select({ id: schema.pushSubscriptions.id })
        .from(schema.pushSubscriptions)
        .where(
          and(eq(schema.pushSubscriptions.userId, input.userId), eq(schema.pushSubscriptions.id, input.id)),
        )
        .limit(1);
      return ownedId ? { kind: "id_conflict" } : { kind: "endpoint_conflict" };
    },

    async refresh(input, executor) {
      const [row] = await executor
        .update(schema.pushSubscriptions)
        .set({
          endpointCiphertext: input.endpointCiphertext,
          p256dhCiphertext: input.p256dhCiphertext,
          authCiphertext: input.authCiphertext,
          encryptionKeyVersion: input.encryptionKeyVersion,
          deviceLabel: input.deviceLabel,
          userAgentSummary: input.userAgentSummary,
          lastUsedAt: input.now,
        })
        .where(
          and(
            eq(schema.pushSubscriptions.userId, input.userId),
            eq(schema.pushSubscriptions.id, input.id),
            isNull(schema.pushSubscriptions.revokedAt),
          ),
        )
        .returning();
      return row ? mapSubscription(row) : null;
    },

    async revoke(userId, subscriptionId, now, executor) {
      const [row] = await executor
        .update(schema.pushSubscriptions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(schema.pushSubscriptions.userId, userId),
            eq(schema.pushSubscriptions.id, subscriptionId),
            isNull(schema.pushSubscriptions.revokedAt),
          ),
        )
        .returning();
      return row ? mapSubscription(row) : null;
    },

    async removeRevoked(userId, subscriptionId, revokedBefore, executor) {
      const [row] = await executor
        .delete(schema.pushSubscriptions)
        .where(
          and(
            eq(schema.pushSubscriptions.userId, userId),
            eq(schema.pushSubscriptions.id, subscriptionId),
            isNotNull(schema.pushSubscriptions.revokedAt),
            lte(schema.pushSubscriptions.revokedAt, revokedBefore),
            notExists(
              executor
                .select({ id: schema.notificationDeliveries.id })
                .from(schema.notificationDeliveries)
                .where(
                  and(
                    eq(schema.notificationDeliveries.userId, userId),
                    eq(schema.notificationDeliveries.subscriptionId, subscriptionId),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: schema.pushSubscriptions.id });
      return row !== undefined;
    },

    async listRecoveryPage(userId, afterId, limit, executor) {
      assertRecoveryPageLimit(limit);
      const rows = await executor
        .select()
        .from(schema.pushSubscriptions)
        .where(
          and(
            eq(schema.pushSubscriptions.userId, userId),
            afterId ? gt(schema.pushSubscriptions.id, afterId) : undefined,
          ),
        )
        .orderBy(asc(schema.pushSubscriptions.id))
        .limit(limit);
      return rows.map(mapSubscription);
    },
  };
}

function mapSubscription(row: SubscriptionRow): StoredPushSubscription {
  return { ...row, endpointHash: new Uint8Array(row.endpointHash) };
}

function assertRecoveryPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Notification recovery repository limit must be from 1 through 100.");
  }
}

function assertActiveProbeLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX) {
    throw new RangeError(
      `Active subscription probes must read from 1 through ${ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX} IDs.`,
    );
  }
}
