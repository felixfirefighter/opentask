import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  entityIdSchema,
  moveTaskRequestSchema,
  positionTaskRequestSchema,
  type MoveTaskRequest,
  type PositionTaskRequest,
  type TaskDto,
} from "./contracts";
import { createTaskDeletionCommands } from "./task-deletion-commands";
import { createTaskLifecycleLocks } from "./task-lifecycle-locks";
import type { TaskRecurrenceLifecycle } from "./task-recurrence-lifecycle";
import {
  applyTaskSiblingRebalance,
  assertAllowedParent,
  assertMutableTask,
  mapTask,
  planLockedTaskRank,
  planTaskRank,
  requireAppliedTask,
  sameTaskRankScope,
  taskRankLockScope,
  taskRankScope,
} from "./task-application-support";
import { taskConflict, taskResourceNotFound } from "./task-errors";
import { lockRankScopes } from "../infrastructure/rank-scope-lock";
import { createSectionRepository } from "../infrastructure/section-repository";
import { createTaskRepository } from "../infrastructure/task-repository";
import { createTaskListRepository } from "../infrastructure/task-list-repository";

export function createTaskLifecycleCommands({
  database,
  clock,
  recurrenceLifecycle,
}: {
  database: Database;
  clock: Clock;
  recurrenceLifecycle: TaskRecurrenceLifecycle;
}) {
  const tasks = createTaskRepository(database);
  const lists = createTaskListRepository(database);
  const sections = createSectionRepository(database);
  const lifecycleLocks = createTaskLifecycleLocks({ tasks, lists, sections });

  return {
    ...createTaskDeletionCommands({ database, clock, recurrenceLifecycle }),

    async moveTask(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: MoveTaskRequest,
    ): Promise<TaskDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = moveTaskRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const observed = await tasks.findById(actor.userId, taskId, "any", transaction);
        assertMutableTask(observed, input.expectedVersion);
        const sourceScope = taskRankScope(observed);
        const destinationScope = taskRankScope(input);
        await lifecycleLocks.lockContainers(
          actor.userId,
          [observed, { listId: input.listId, sectionId: input.sectionId }],
          observed,
          transaction,
        );
        await lockRankScopes(transaction, [
          taskRankLockScope(actor.userId, sourceScope),
          taskRankLockScope(actor.userId, destinationScope),
          ...(observed.parentTaskId === null
            ? [
                taskRankLockScope(actor.userId, {
                  kind: "subtask",
                  listId: observed.listId,
                  parentTaskId: taskId,
                }),
              ]
            : []),
        ]);
        const children =
          observed.parentTaskId === null
            ? await tasks.listDirectSubtasks(actor.userId, taskId, "any", transaction)
            : [];
        const locked = await lifecycleLocks.lockTasks(
          actor.userId,
          [taskId, ...children.map(({ id }) => id), ...(input.parentTaskId ? [input.parentTaskId] : [])],
          transaction,
        );
        const current = locked.get(taskId) ?? null;
        assertMutableTask(current, input.expectedVersion);
        if (!sameTaskRankScope(sourceScope, taskRankScope(current))) {
          throw taskConflict("The task moved elsewhere. Refresh and try again.", current.version);
        }
        const parent = input.parentTaskId ? (locked.get(input.parentTaskId) ?? null) : null;
        if (input.parentTaskId !== null && (!parent || parent.deletedAt !== null))
          throw taskResourceNotFound();
        assertAllowedParent({ id: taskId, userId: actor.userId, listId: input.listId }, parent);
        if (input.parentTaskId !== null && children.length > 0) {
          throw taskConflict("A task with subtasks cannot become a subtask.", current.version);
        }
        const planned = planTaskRank(
          await tasks.listActiveRankScope(actor.userId, destinationScope, transaction),
          taskId,
          input.placement,
        );
        const now = clock.now();
        await applyTaskSiblingRebalance(
          tasks,
          actor.userId,
          destinationScope,
          planned,
          taskId,
          now,
          transaction,
        );
        const moved = requireAppliedTask(
          await tasks.move(
            {
              userId: actor.userId,
              id: taskId,
              expectedVersion: input.expectedVersion,
              listId: input.listId,
              sectionId: input.sectionId,
              parentTaskId: input.parentTaskId,
              rank: planned.plan.rank,
              now,
            },
            transaction,
          ),
        );
        if (current.parentTaskId === null && current.listId !== input.listId) {
          await tasks.moveDirectSubtasks(
            {
              userId: actor.userId,
              rootTaskId: taskId,
              sourceListId: current.listId,
              destinationListId: input.listId,
              now,
            },
            transaction,
          );
        }
        return mapTask(moved);
      });
    },

    async positionTask(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: PositionTaskRequest,
    ): Promise<TaskDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = positionTaskRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const observed = await tasks.findById(actor.userId, taskId, "any", transaction);
        assertMutableTask(observed, input.expectedVersion);
        await lifecycleLocks.lockContainers(actor.userId, [observed], observed, transaction);
        const scope = taskRankScope(observed);
        const planned = await planLockedTaskRank(
          transaction,
          tasks,
          actor.userId,
          scope,
          taskId,
          input.placement,
        );
        const current = await tasks.lockById(actor.userId, taskId, "any", transaction);
        assertMutableTask(current, input.expectedVersion);
        if (!sameTaskRankScope(scope, taskRankScope(current))) {
          throw taskConflict("The task moved elsewhere. Refresh and try again.", current.version);
        }
        const now = clock.now();
        await applyTaskSiblingRebalance(tasks, actor.userId, scope, planned, taskId, now, transaction);
        return mapTask(
          requireAppliedTask(
            await tasks.updateRank(
              {
                userId: actor.userId,
                id: taskId,
                expectedVersion: input.expectedVersion,
                scope,
                rank: planned.plan.rank,
                now,
              },
              transaction,
            ),
          ),
        );
      });
    },
  };
}
