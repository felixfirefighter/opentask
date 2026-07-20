import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { deleteTaskRequestSchema, entityIdSchema, restoreTaskRequestSchema, type TaskDto } from "./contracts";
import { createTaskLifecycleLocks } from "./task-lifecycle-locks";
import type { TaskRecurrenceLifecycle } from "./task-recurrence-lifecycle";
import {
  assertAllowedParent,
  assertMutableTask,
  assertRestorableTask,
  mapTask,
  requireAppliedTask,
  sameTaskRankScope,
  taskRankLockScope,
  taskRankScope,
} from "./task-application-support";
import { taskConflict, taskResourceNotFound } from "./task-errors";
import { chooseTaskTreeDeletionInstant } from "../domain/deletion-event-policy";
import { lockRankScope } from "../infrastructure/rank-scope-lock";
import { createSectionRepository } from "../infrastructure/section-repository";
import { createTaskRepository, type StoredTask } from "../infrastructure/task-repository";
import { createTaskListRepository } from "../infrastructure/task-list-repository";

export function createTaskDeletionCommands({
  database,
  clock,
  recurrenceLifecycle,
}: {
  database: Database;
  clock: Clock;
  recurrenceLifecycle: TaskRecurrenceLifecycle;
}) {
  const tasks = createTaskRepository(database);
  const lifecycleLocks = createTaskLifecycleLocks({
    tasks,
    lists: createTaskListRepository(database),
    sections: createSectionRepository(database),
  });

  return {
    async deleteTask(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: { expectedVersion: number },
    ): Promise<TaskDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = deleteTaskRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const observed = await tasks.findById(actor.userId, taskId, "any", transaction);
        assertMutableTask(observed, input.expectedVersion);
        if (observed.parentTaskId === null) {
          await lifecycleLocks.lockContainers(actor.userId, [observed], observed, transaction);
          await lockRankScope(
            transaction,
            taskRankLockScope(actor.userId, {
              kind: "subtask",
              listId: observed.listId,
              parentTaskId: taskId,
            }),
          );
        }
        const children =
          observed.parentTaskId === null
            ? await tasks.listDirectSubtasks(actor.userId, taskId, "any", transaction)
            : [];
        const locked = await lifecycleLocks.lockTasks(
          actor.userId,
          [taskId, ...children.map(({ id }) => id)],
          transaction,
        );
        const current = locked.get(taskId) ?? null;
        assertMutableTask(current, input.expectedVersion);
        assertObservedScope(current, observed);
        const lockedChildren = requireLockedDirectChildren(children, locked, taskId, current.version);
        await recurrenceLifecycle.lockResources(actor.userId, taskId, transaction);
        const now = clock.now();
        const deletionInstant =
          current.parentTaskId === null
            ? chooseTaskTreeDeletionInstant(
                now,
                lockedChildren.flatMap(({ deletedAt }) => (deletedAt ? [deletedAt] : [])),
              )
            : now;
        const deleted = requireAppliedTask(
          await tasks.softDelete(
            {
              userId: actor.userId,
              id: taskId,
              expectedVersion: input.expectedVersion,
              deletionInstant,
              now,
            },
            transaction,
          ),
        );
        if (current.parentTaskId === null) {
          const deletedChildren = await tasks.softDeleteActiveDirectSubtasks(
            { userId: actor.userId, rootTaskId: taskId, deletionInstant, now },
            transaction,
          );
          if (deletedChildren.length !== lockedChildren.filter(({ deletedAt }) => !deletedAt).length) {
            throw taskTreeChanged(deleted.version);
          }
        }
        return mapTask(deleted);
      });
    },

    async restoreTask(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: { expectedVersion: number },
    ): Promise<TaskDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = restoreTaskRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const observed = await tasks.findById(actor.userId, taskId, "any", transaction);
        assertRestorableTask(observed, input.expectedVersion);
        if (!observed.deletedAt) throw new Error("Restorable task is missing its deletion instant.");
        const deletionInstant = observed.deletedAt;
        await lifecycleLocks.lockContainers(actor.userId, [observed], observed, transaction);
        const children =
          observed.parentTaskId === null
            ? await tasks.listDirectSubtasks(actor.userId, taskId, "any", transaction)
            : [];
        const observedEventChildren = children.filter(
          (child) => child.deletedAt?.getTime() === deletionInstant.getTime(),
        );
        if (observed.parentTaskId === null) {
          await lifecycleLocks.lockContainers(
            actor.userId,
            [observed, ...observedEventChildren],
            observed,
            transaction,
          );
          await lockRankScope(
            transaction,
            taskRankLockScope(actor.userId, {
              kind: "subtask",
              listId: observed.listId,
              parentTaskId: taskId,
            }),
          );
        }
        const locked = await lifecycleLocks.lockTasks(
          actor.userId,
          [
            taskId,
            ...children.map(({ id }) => id),
            ...(observed.parentTaskId ? [observed.parentTaskId] : []),
          ],
          transaction,
        );
        const current = locked.get(taskId) ?? null;
        assertRestorableTask(current, input.expectedVersion);
        assertObservedScope(current, observed);
        const parent = current.parentTaskId ? (locked.get(current.parentTaskId) ?? null) : null;
        if (current.parentTaskId !== null && (!parent || parent.deletedAt !== null)) {
          throw taskResourceNotFound();
        }
        assertAllowedParent({ id: taskId, userId: actor.userId, listId: current.listId }, parent);
        const lockedChildren = requireLockedDirectChildren(children, locked, taskId, current.version);
        const eventChildren = lockedChildren.filter(
          (child) => child.deletedAt?.getTime() === deletionInstant.getTime(),
        );
        for (const child of eventChildren) {
          assertAllowedParent(
            { id: child.id, userId: actor.userId, listId: child.listId },
            { ...current, deletedAt: null },
          );
        }
        const now = clock.now();
        const recurrenceResources = await recurrenceLifecycle.lockResources(
          actor.userId,
          taskId,
          transaction,
        );
        await recurrenceLifecycle.advanceForResume(actor.userId, recurrenceResources, now, transaction);
        const restored = requireAppliedTask(
          await tasks.restore(
            { userId: actor.userId, id: taskId, expectedVersion: input.expectedVersion, now },
            transaction,
          ),
        );
        if (current.parentTaskId === null) {
          const restoredChildren = await tasks.restoreDirectSubtasksFromDeletion(
            { userId: actor.userId, rootTaskId: taskId, deletionInstant, now },
            transaction,
          );
          if (restoredChildren.length !== eventChildren.length) throw taskTreeChanged(restored.version);
        }
        return mapTask(restored);
      });
    },
  };
}

function requireLockedDirectChildren(
  children: readonly Pick<StoredTask, "id">[],
  locked: ReadonlyMap<string, StoredTask | null>,
  taskId: string,
  currentVersion: number,
) {
  const currentChildren = children.flatMap(({ id }) => {
    const child = locked.get(id) ?? null;
    return child?.parentTaskId === taskId ? [child] : [];
  });
  if (currentChildren.length !== children.length) throw taskTreeChanged(currentVersion);
  return currentChildren;
}

function assertObservedScope(current: StoredTask, observed: StoredTask) {
  if (!sameTaskRankScope(taskRankScope(observed), taskRankScope(current))) {
    throw taskConflict("The task moved elsewhere. Refresh and try again.", current.version);
  }
}

function taskTreeChanged(currentVersion: number) {
  return taskConflict("The task tree changed elsewhere. Refresh and try again.", currentVersion);
}
