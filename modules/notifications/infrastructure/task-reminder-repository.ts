import { and, asc, eq, gt } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

type ReminderRow = typeof schema.taskReminders.$inferSelect;
export type StoredTaskReminder = Omit<ReminderRow, "kind"> & {
  kind: "absolute" | "relative_start";
};

type TaskReminderRepositoryAdapter = Readonly<{
  findByTask(
    userId: string,
    taskId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<StoredTaskReminder | null>;
  findById(
    userId: string,
    reminderId: string,
    executor: DatabaseExecutor,
    lock?: boolean,
  ): Promise<StoredTaskReminder | null>;
  insert(
    input: Readonly<{
      id: string;
      userId: string;
      taskId: string;
      kind: StoredTaskReminder["kind"];
      remindAt: Date | null;
      offsetMinutes: number | null;
      enabled: boolean;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<StoredTaskReminder | null>;
  replace(
    input: Readonly<{
      userId: string;
      taskId: string;
      expectedVersion: number;
      kind: StoredTaskReminder["kind"];
      remindAt: Date | null;
      offsetMinutes: number | null;
      enabled: boolean;
      now: Date;
    }>,
    executor: DatabaseExecutor,
  ): Promise<StoredTaskReminder | null>;
  remove(
    userId: string,
    taskId: string,
    expectedVersion: number,
    executor: DatabaseExecutor,
  ): Promise<StoredTaskReminder | null>;
  listRecoveryPage(
    userId: string,
    afterId: string | null,
    limit: number,
    executor: DatabaseExecutor,
  ): Promise<readonly StoredTaskReminder[]>;
}>;

export function createTaskReminderRepository(): TaskReminderRepositoryAdapter {
  return {
    async findByTask(userId, taskId, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.taskReminders)
        .where(and(eq(schema.taskReminders.userId, userId), eq(schema.taskReminders.taskId, taskId)))
        .limit(1);
      const [row] = lock ? await query.for("update") : await query;
      return row ? mapReminder(row) : null;
    },

    async findById(userId, reminderId, executor, lock = false) {
      const query = executor
        .select()
        .from(schema.taskReminders)
        .where(and(eq(schema.taskReminders.userId, userId), eq(schema.taskReminders.id, reminderId)))
        .limit(1);
      const [row] = lock ? await query.for("update") : await query;
      return row ? mapReminder(row) : null;
    },

    async insert(input, executor) {
      const [row] = await executor
        .insert(schema.taskReminders)
        .values({ ...input, version: 1, createdAt: input.now, updatedAt: input.now })
        .onConflictDoNothing()
        .returning();
      return row ? mapReminder(row) : null;
    },

    async replace(input, executor) {
      const [row] = await executor
        .update(schema.taskReminders)
        .set({
          kind: input.kind,
          remindAt: input.remindAt,
          offsetMinutes: input.offsetMinutes,
          enabled: input.enabled,
          version: input.expectedVersion + 1,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.taskReminders.userId, input.userId),
            eq(schema.taskReminders.taskId, input.taskId),
            eq(schema.taskReminders.version, input.expectedVersion),
          ),
        )
        .returning();
      return row ? mapReminder(row) : null;
    },

    async remove(userId, taskId, expectedVersion, executor) {
      const [row] = await executor
        .delete(schema.taskReminders)
        .where(
          and(
            eq(schema.taskReminders.userId, userId),
            eq(schema.taskReminders.taskId, taskId),
            eq(schema.taskReminders.version, expectedVersion),
          ),
        )
        .returning();
      return row ? mapReminder(row) : null;
    },

    async listRecoveryPage(userId, afterId, limit, executor) {
      assertRecoveryPageLimit(limit);
      const rows = await executor
        .select()
        .from(schema.taskReminders)
        .where(
          and(
            eq(schema.taskReminders.userId, userId),
            afterId ? gt(schema.taskReminders.id, afterId) : undefined,
          ),
        )
        .orderBy(asc(schema.taskReminders.id))
        .limit(limit);
      return rows.map(mapReminder);
    },
  };
}

function mapReminder(row: ReminderRow): StoredTaskReminder {
  return {
    ...row,
    kind: row.kind as StoredTaskReminder["kind"],
  };
}

function assertRecoveryPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Notification recovery repository limit must be from 1 through 100.");
  }
}
