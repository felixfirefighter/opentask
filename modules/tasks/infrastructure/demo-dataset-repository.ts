import { and, eq, isNull, sql } from "drizzle-orm";

import type { DatabaseExecutor, DatabaseTransaction } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type DemoTaskRecord = Readonly<{
  id: string;
  listId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  title: string;
  descriptionMd: string;
  status: "open" | "completed" | "cancelled";
  priority: "none" | "low" | "medium" | "high";
  rank: string;
}>;

export type DemoScheduleRecord =
  | Readonly<{ taskId: string; kind: "all_day"; startDate: string; endDate: string }>
  | Readonly<{
      taskId: string;
      kind: "timed";
      startAt: Date;
      endAt: Date;
      timezone: string;
    }>;

export type DemoDatasetRecords = Readonly<{
  folder: Readonly<{ id: string; name: string; rank: string }>;
  regularList: Readonly<{
    id: string;
    folderId: string;
    name: string;
    colorToken: string;
    rank: string;
  }>;
  section: Readonly<{ id: string; listId: string; name: string; rank: string }>;
  tags: readonly Readonly<{ id: string; name: string; colorToken: string }>[];
  tasks: readonly DemoTaskRecord[];
  schedules: readonly DemoScheduleRecord[];
  checklistItems: readonly Readonly<{
    id: string;
    taskId: string;
    title: string;
    isCompleted: boolean;
    rank: string;
  }>[];
  taskTags: readonly Readonly<{ taskId: string; tagId: string }>[];
  resetAt: Date;
}>;

export function createDemoDatasetRepository() {
  return {
    async lockAndFindActiveInbox(userId: string, transaction: DatabaseTransaction): Promise<string | null> {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`opentask:demo-reset:${userId}`}, 0))`,
      );
      const [inbox] = await transaction
        .select({ id: schema.taskLists.id })
        .from(schema.taskLists)
        .where(
          and(
            eq(schema.taskLists.userId, userId),
            eq(schema.taskLists.kind, "inbox"),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      return inbox?.id ?? null;
    },

    async replaceOwnedDataset(
      userId: string,
      records: DemoDatasetRecords,
      transaction: DatabaseTransaction,
    ): Promise<void> {
      await clearOwnedTaskData(userId, transaction);
      await insertOrganization(userId, records, transaction);
      await insertTasks(userId, records, transaction);
    },
  };
}

async function clearOwnedTaskData(userId: string, executor: DatabaseExecutor): Promise<void> {
  await executor.delete(schema.taskTags).where(eq(schema.taskTags.userId, userId));
  await executor.delete(schema.checklistItems).where(eq(schema.checklistItems.userId, userId));
  await executor.delete(schema.taskSchedules).where(eq(schema.taskSchedules.userId, userId));
  await executor.delete(schema.tasks).where(eq(schema.tasks.userId, userId));
  await executor.delete(schema.listSections).where(eq(schema.listSections.userId, userId));
  await executor
    .delete(schema.taskLists)
    .where(and(eq(schema.taskLists.userId, userId), eq(schema.taskLists.kind, "regular")));
  await executor.delete(schema.listFolders).where(eq(schema.listFolders.userId, userId));
  await executor.delete(schema.tags).where(eq(schema.tags.userId, userId));
}

async function insertOrganization(
  userId: string,
  records: DemoDatasetRecords,
  executor: DatabaseExecutor,
): Promise<void> {
  const { resetAt } = records;
  await executor.insert(schema.listFolders).values({
    ...records.folder,
    userId,
    version: 1,
    createdAt: resetAt,
    updatedAt: resetAt,
    deletedAt: null,
  });
  await executor.insert(schema.taskLists).values({
    ...records.regularList,
    userId,
    kind: "regular",
    version: 1,
    createdAt: resetAt,
    updatedAt: resetAt,
    deletedAt: null,
  });
  await executor.insert(schema.listSections).values({
    ...records.section,
    userId,
    version: 1,
    createdAt: resetAt,
    updatedAt: resetAt,
  });
  await executor.insert(schema.tags).values(
    records.tags.map((tag) => ({
      ...tag,
      userId,
      version: 1,
      createdAt: resetAt,
      updatedAt: resetAt,
      deletedAt: null,
    })),
  );
}

async function insertTasks(
  userId: string,
  records: DemoDatasetRecords,
  executor: DatabaseExecutor,
): Promise<void> {
  const { resetAt } = records;
  await executor.insert(schema.tasks).values(
    records.tasks.map((task) => ({
      ...task,
      userId,
      statusChangedAt: resetAt,
      version: 1,
      createdAt: resetAt,
      updatedAt: resetAt,
      deletedAt: null,
    })),
  );
  await executor.insert(schema.taskSchedules).values(
    records.schedules.map((schedule) => ({
      userId,
      taskId: schedule.taskId,
      kind: schedule.kind,
      startDate: schedule.kind === "all_day" ? schedule.startDate : null,
      endDate: schedule.kind === "all_day" ? schedule.endDate : null,
      startAt: schedule.kind === "timed" ? schedule.startAt : null,
      endAt: schedule.kind === "timed" ? schedule.endAt : null,
      timezone: schedule.kind === "timed" ? schedule.timezone : null,
      createdAt: resetAt,
      updatedAt: resetAt,
    })),
  );
  await executor.insert(schema.checklistItems).values(
    records.checklistItems.map((item) => ({
      ...item,
      userId,
      version: 1,
      createdAt: resetAt,
      updatedAt: resetAt,
    })),
  );
  await executor.insert(schema.taskTags).values(records.taskTags.map((taskTag) => ({ ...taskTag, userId })));
}
