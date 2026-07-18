import { and, asc, count, eq, gt, isNotNull, isNull, or, type SQL } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { TaskStatus } from "../domain/status-policy";

export type TaskLifecycle = "active" | "deleted";
export type TaskReadLifecycle = TaskLifecycle | "any";
export type TaskRankScope =
  | Readonly<{ kind: "root"; listId: string; sectionId: string | null }>
  | Readonly<{ kind: "subtask"; listId: string; parentTaskId: string }>;
export type TaskPageCursor = Readonly<{ rank: string; id: string }>;
export type ActiveTaskPageQuery = Readonly<{
  listId: string;
  sectionId?: string;
  parentTaskId: string | null;
  status: TaskStatus;
  limit: number;
  after?: TaskPageCursor;
}>;

export async function findScopedTask(
  userId: string,
  id: string,
  lifecycle: TaskReadLifecycle,
  executor: DatabaseExecutor,
) {
  const [row] = await executor
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.id, id), taskLifecyclePredicate(lifecycle)))
    .limit(1);
  return row ?? null;
}

export async function lockScopedTask(
  userId: string,
  id: string,
  lifecycle: TaskReadLifecycle,
  executor: DatabaseExecutor,
) {
  const [row] = await executor
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.id, id), taskLifecyclePredicate(lifecycle)))
    .limit(1)
    .for("update");
  return row ?? null;
}

export function listActiveTaskPage(userId: string, query: ActiveTaskPageQuery, executor: DatabaseExecutor) {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 101) {
    throw new RangeError("Task repository page limit must be between 1 and 101.");
  }
  const after = query.after;
  return executor
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.userId, userId),
        eq(schema.tasks.listId, query.listId),
        eq(schema.tasks.status, query.status),
        isNull(schema.tasks.deletedAt),
        query.parentTaskId === null
          ? isNull(schema.tasks.parentTaskId)
          : eq(schema.tasks.parentTaskId, query.parentTaskId),
        query.sectionId === undefined ? undefined : eq(schema.tasks.sectionId, query.sectionId),
        after
          ? or(
              gt(schema.tasks.rank, after.rank),
              and(eq(schema.tasks.rank, after.rank), gt(schema.tasks.id, after.id)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(schema.tasks.rank), asc(schema.tasks.id))
    .limit(query.limit);
}

export function listActiveTaskRankScope(userId: string, scope: TaskRankScope, executor: DatabaseExecutor) {
  return executor
    .select({ id: schema.tasks.id, rank: schema.tasks.rank, version: schema.tasks.version })
    .from(schema.tasks)
    .where(
      and(eq(schema.tasks.userId, userId), isNull(schema.tasks.deletedAt), taskRankScopePredicate(scope)),
    )
    .orderBy(asc(schema.tasks.rank), asc(schema.tasks.id));
}

export function listDirectSubtasks(
  userId: string,
  parentTaskId: string,
  lifecycle: TaskReadLifecycle,
  executor: DatabaseExecutor,
) {
  return executor
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.userId, userId),
        eq(schema.tasks.parentTaskId, parentTaskId),
        taskLifecyclePredicate(lifecycle),
      ),
    )
    .orderBy(asc(schema.tasks.rank), asc(schema.tasks.id));
}

export async function countActiveTasksByList(userId: string, listId: string, executor: DatabaseExecutor) {
  const [row] = await executor
    .select({ value: count() })
    .from(schema.tasks)
    .where(
      and(eq(schema.tasks.userId, userId), eq(schema.tasks.listId, listId), isNull(schema.tasks.deletedAt)),
    );
  return row?.value ?? 0;
}

export function taskLifecyclePredicate(lifecycle: TaskReadLifecycle) {
  if (lifecycle === "active") return isNull(schema.tasks.deletedAt);
  if (lifecycle === "deleted") return isNotNull(schema.tasks.deletedAt);
  return undefined;
}

export function taskRankScopePredicate(scope: TaskRankScope): SQL {
  if (scope.kind === "subtask") {
    return and(eq(schema.tasks.listId, scope.listId), eq(schema.tasks.parentTaskId, scope.parentTaskId))!;
  }
  return and(
    eq(schema.tasks.listId, scope.listId),
    isNull(schema.tasks.parentTaskId),
    scope.sectionId === null ? isNull(schema.tasks.sectionId) : eq(schema.tasks.sectionId, scope.sectionId),
  )!;
}
