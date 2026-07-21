import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";

import type { NotificationErrorCode } from "../domain/notification-limits";
import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

type DeliveryRow = typeof schema.notificationDeliveries.$inferSelect;
export type StoredNotificationDelivery = Omit<DeliveryRow, "state" | "lastErrorCode"> & {
  state: "scheduled" | "delivering" | "retry_scheduled" | "delivered" | "suppressed" | "failed";
  lastErrorCode: NotificationErrorCode | null;
};
export type InsertStoredNotificationDeliveryResult = Readonly<{
  delivery: StoredNotificationDelivery;
  inserted: boolean;
}>;

type NotificationDeliveryRepositoryAdapter = Readonly<{
  findById(
    userId: string,
    deliveryId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<StoredNotificationDelivery | null>;
  listByReminder(
    userId: string,
    reminderId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<readonly StoredNotificationDelivery[]>;
  listBySubscription(
    userId: string,
    subscriptionId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<readonly StoredNotificationDelivery[]>;
  insertIfAbsent(
    input: Readonly<{
      id: string;
      userId: string;
      reminderId: string;
      subscriptionId: string;
      occurrenceKey: string | null;
      scheduledFor: Date;
      idempotencyKey: string;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<InsertStoredNotificationDeliveryResult>;
  writeState(
    input: Readonly<{
      userId: string;
      id: string;
      expectedState: StoredNotificationDelivery["state"];
      expectedAttemptCount: number;
      state: StoredNotificationDelivery["state"];
      attemptCount: number;
      lastErrorCode: NotificationErrorCode | null;
      deliveredAt: Date | null;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<StoredNotificationDelivery | null>;
  removeTerminal(
    userId: string,
    deliveryId: string,
    updatedBefore: Date,
    executor: DatabaseExecutor,
  ): Promise<boolean>;
  hasForSubscription(userId: string, subscriptionId: string, executor: DatabaseExecutor): Promise<boolean>;
  listRecoveryPage(
    userId: string,
    afterId: string | null,
    limit: number,
    executor: DatabaseExecutor,
  ): Promise<readonly StoredNotificationDelivery[]>;
}>;

export class NotificationPersistenceConflictError extends Error {
  constructor() {
    super("Notification persistence conflict.");
    this.name = "NotificationPersistenceConflictError";
  }
}

export function createNotificationDeliveryRepository(): NotificationDeliveryRepositoryAdapter {
  return {
    async findById(userId, deliveryId, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.userId, userId),
            eq(schema.notificationDeliveries.id, deliveryId),
          ),
        )
        .limit(1);
      const [row] = lock ? await query.for("update") : await query;
      return row ? mapDelivery(row) : null;
    },

    async listByReminder(userId, reminderId, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.userId, userId),
            eq(schema.notificationDeliveries.reminderId, reminderId),
          ),
        )
        .orderBy(asc(schema.notificationDeliveries.id));
      const rows = lock ? await query.for("update") : await query;
      return rows.map(mapDelivery);
    },

    async listBySubscription(userId, subscriptionId, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.userId, userId),
            eq(schema.notificationDeliveries.subscriptionId, subscriptionId),
          ),
        )
        .orderBy(asc(schema.notificationDeliveries.id));
      const rows = lock ? await query.for("update") : await query;
      return rows.map(mapDelivery);
    },

    async insertIfAbsent(input, executor): Promise<InsertStoredNotificationDeliveryResult> {
      const [row] = await executor
        .insert(schema.notificationDeliveries)
        .values({
          ...input,
          state: "scheduled",
          attemptCount: 0,
          lastErrorCode: null,
          deliveredAt: null,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing()
        .returning();
      if (row) return { delivery: mapDelivery(row), inserted: true };

      const [existing] = await executor
        .select()
        .from(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.userId, input.userId),
            eq(schema.notificationDeliveries.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing) throw new NotificationPersistenceConflictError();
      return { delivery: mapDelivery(existing), inserted: false };
    },

    async writeState(input, executor) {
      const [row] = await executor
        .update(schema.notificationDeliveries)
        .set({
          state: input.state,
          attemptCount: input.attemptCount,
          lastErrorCode: input.lastErrorCode,
          deliveredAt: input.deliveredAt,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.notificationDeliveries.userId, input.userId),
            eq(schema.notificationDeliveries.id, input.id),
            eq(schema.notificationDeliveries.state, input.expectedState),
            eq(schema.notificationDeliveries.attemptCount, input.expectedAttemptCount),
          ),
        )
        .returning();
      return row ? mapDelivery(row) : null;
    },

    async removeTerminal(userId, deliveryId, updatedBefore, executor) {
      const [row] = await executor
        .delete(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.userId, userId),
            eq(schema.notificationDeliveries.id, deliveryId),
            inArray(schema.notificationDeliveries.state, ["delivered", "suppressed", "failed"]),
            lte(schema.notificationDeliveries.updatedAt, updatedBefore),
          ),
        )
        .returning({ id: schema.notificationDeliveries.id });
      return row !== undefined;
    },

    async hasForSubscription(userId, subscriptionId, executor) {
      const [row] = await executor
        .select({ id: schema.notificationDeliveries.id })
        .from(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.userId, userId),
            eq(schema.notificationDeliveries.subscriptionId, subscriptionId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async listRecoveryPage(userId, afterId, limit, executor) {
      assertRecoveryPageLimit(limit);
      const rows = await executor
        .select()
        .from(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.userId, userId),
            afterId ? gt(schema.notificationDeliveries.id, afterId) : undefined,
          ),
        )
        .orderBy(asc(schema.notificationDeliveries.id))
        .limit(limit);
      return rows.map(mapDelivery);
    },
  };
}

function mapDelivery(row: DeliveryRow): StoredNotificationDelivery {
  return {
    ...row,
    state: row.state as StoredNotificationDelivery["state"],
    lastErrorCode: row.lastErrorCode as StoredNotificationDelivery["lastErrorCode"],
  };
}

function assertRecoveryPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Notification recovery repository limit must be from 1 through 100.");
  }
}
