import { and, eq, sql, type SQL } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { TaskStatus } from "../domain/status-policy";
import {
  countActiveTasksByList,
  findScopedTask,
  listDirectSubtasks,
  listActiveTerminalTaskPage,
  listActiveTaskPage,
  listActiveTaskRankScope,
  lockScopedTask,
  taskLifecyclePredicate,
  taskRankScopePredicate,
  type ActiveTaskPageQuery,
  type ActiveTerminalTaskPageQuery,
  type TaskLifecycle,
  type TaskReadLifecycle,
  type TaskRankScope,
} from "./task-repository-queries";
import { createTaskTreeRepository } from "./task-tree-repository";

export type StoredTask = typeof schema.tasks.$inferSelect;
export type TaskPriority = "none" | "low" | "medium" | "high";
export type {
  ActiveTaskPageQuery,
  ActiveTerminalTaskPageQuery,
  TaskLifecycle,
  TaskPageCursor,
  TaskRankScope,
  TaskReadLifecycle,
} from "./task-repository-queries";

export type TaskWriteResult =
  | Readonly<{ outcome: "applied"; task: StoredTask }>
  | Readonly<{ outcome: "not-found" }>
  | Readonly<{ outcome: "stale"; currentVersion: number }>
  | Readonly<{
      outcome: "lifecycle-conflict";
      currentVersion: number;
      lifecycle: TaskLifecycle;
    }>;

type VersionedTaskWrite = Readonly<{
  userId: string;
  id: string;
  expectedVersion: number;
  now: Date;
}>;

type TaskChanges = Partial<
  Pick<
    StoredTask,
    | "title"
    | "descriptionMd"
    | "priority"
    | "status"
    | "statusChangedAt"
    | "listId"
    | "sectionId"
    | "parentTaskId"
    | "rank"
    | "deletedAt"
  >
>;

export function createTaskRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    ...createTaskTreeRepository(defaultExecutor),

    findById(
      userId: string,
      id: string,
      lifecycle: TaskReadLifecycle,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return findScopedTask(userId, id, lifecycle, executor);
    },

    lockById(
      userId: string,
      id: string,
      lifecycle: TaskReadLifecycle,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return lockScopedTask(userId, id, lifecycle, executor);
    },

    listActivePage(userId: string, query: ActiveTaskPageQuery, executor: DatabaseExecutor = defaultExecutor) {
      return listActiveTaskPage(userId, query, executor);
    },

    listActiveTerminalPage(
      userId: string,
      query: ActiveTerminalTaskPageQuery,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return listActiveTerminalTaskPage(userId, query, executor);
    },

    listActiveRankScope(userId: string, scope: TaskRankScope, executor: DatabaseExecutor = defaultExecutor) {
      return listActiveTaskRankScope(userId, scope, executor);
    },

    listDirectSubtasks(
      userId: string,
      parentTaskId: string,
      lifecycle: TaskReadLifecycle,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return listDirectSubtasks(userId, parentTaskId, lifecycle, executor);
    },

    async countActiveByList(userId: string, listId: string, executor: DatabaseExecutor = defaultExecutor) {
      return countActiveTasksByList(userId, listId, executor);
    },

    async insert(
      input: {
        id: string;
        userId: string;
        listId: string;
        sectionId: string | null;
        parentTaskId: string | null;
        title: string;
        descriptionMd: string;
        priority: TaskPriority;
        rank: string;
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const [row] = await executor
        .insert(schema.tasks)
        .values({
          id: input.id,
          userId: input.userId,
          listId: input.listId,
          sectionId: input.sectionId,
          parentTaskId: input.parentTaskId,
          title: input.title,
          descriptionMd: input.descriptionMd,
          priority: input.priority,
          rank: input.rank,
          status: "open",
          statusChangedAt: input.now,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        })
        .onConflictDoNothing({ target: [schema.tasks.userId, schema.tasks.id] })
        .returning();
      return row ?? null;
    },

    updateDetails(
      input: VersionedTaskWrite & {
        patch: Readonly<{ title?: string; descriptionMd?: string; priority?: TaskPriority }>;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      if (Object.values(input.patch).every((value) => value === undefined)) {
        throw new RangeError("Task patch cannot be empty.");
      }
      return mutateTask(input, "active", input.patch, executor);
    },

    updateStatus(
      input: VersionedTaskWrite & { status: TaskStatus; statusChangedAt: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateTask(
        input,
        "active",
        { status: input.status, statusChangedAt: input.statusChangedAt },
        executor,
      );
    },

    move(
      input: VersionedTaskWrite & {
        listId: string;
        sectionId: string | null;
        parentTaskId: string | null;
        rank: string;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateTask(
        input,
        "active",
        {
          listId: input.listId,
          sectionId: input.sectionId,
          parentTaskId: input.parentTaskId,
          rank: input.rank,
        },
        executor,
      );
    },

    updateRank(
      input: VersionedTaskWrite & { scope: TaskRankScope; rank: string },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateTask(input, "active", { rank: input.rank }, executor, taskRankScopePredicate(input.scope));
    },

    async rewriteRanks(
      userId: string,
      scope: TaskRankScope,
      updates: readonly { id: string; expectedVersion: number; rank: string }[],
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const results: TaskWriteResult[] = [];
      const scopePredicate = taskRankScopePredicate(scope);
      for (const update of updates) {
        results.push(
          await mutateTask(
            { userId, id: update.id, expectedVersion: update.expectedVersion, now },
            "active",
            { rank: update.rank },
            executor,
            scopePredicate,
          ),
        );
      }
      return results;
    },

    softDelete(
      input: VersionedTaskWrite & { deletionInstant: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateTask(input, "active", { deletedAt: input.deletionInstant }, executor);
    },

    restore(input: VersionedTaskWrite, executor: DatabaseExecutor = defaultExecutor) {
      return mutateTask(input, "deleted", { deletedAt: null }, executor);
    },
  };
}

async function mutateTask(
  input: VersionedTaskWrite,
  expectedLifecycle: TaskLifecycle,
  changes: TaskChanges,
  executor: DatabaseExecutor,
  visibility?: SQL,
): Promise<TaskWriteResult> {
  const [row] = await executor
    .update(schema.tasks)
    .set({ ...changes, updatedAt: input.now, version: sql`${schema.tasks.version} + 1` })
    .where(
      and(
        eq(schema.tasks.userId, input.userId),
        eq(schema.tasks.id, input.id),
        eq(schema.tasks.version, input.expectedVersion),
        taskLifecyclePredicate(expectedLifecycle),
        visibility,
      ),
    )
    .returning();
  if (row) return { outcome: "applied", task: row };
  return classifyTaskWriteMiss(input, executor, visibility);
}

async function classifyTaskWriteMiss(
  input: VersionedTaskWrite,
  executor: DatabaseExecutor,
  visibility?: SQL,
): Promise<TaskWriteResult> {
  const [current] = await executor
    .select({ version: schema.tasks.version, deletedAt: schema.tasks.deletedAt })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.userId, input.userId), eq(schema.tasks.id, input.id), visibility))
    .limit(1);
  if (!current) return { outcome: "not-found" };
  if (current.version !== input.expectedVersion) {
    return { outcome: "stale", currentVersion: current.version };
  }
  return {
    outcome: "lifecycle-conflict",
    currentVersion: current.version,
    lifecycle: current.deletedAt === null ? "active" : "deleted",
  };
}
