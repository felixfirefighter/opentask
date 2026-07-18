import type { DatabaseTransaction } from "@/shared/db/client";

import { staleTaskResource, taskResourceNotFound } from "./task-errors";
import type { createSectionRepository } from "../infrastructure/section-repository";
import type { StoredTask, createTaskRepository } from "../infrastructure/task-repository";
import type { createTaskListRepository } from "../infrastructure/task-list-repository";

type TaskRepository = ReturnType<typeof createTaskRepository>;
type TaskListRepository = ReturnType<typeof createTaskListRepository>;
type SectionRepository = ReturnType<typeof createSectionRepository>;
type TaskPlacement = Pick<StoredTask, "listId" | "sectionId">;

export function createTaskLifecycleLocks(repositories: {
  tasks: TaskRepository;
  lists: TaskListRepository;
  sections: SectionRepository;
}) {
  return {
    async lockContainers(
      userId: string,
      placements: readonly TaskPlacement[],
      observedTask: StoredTask,
      transaction: DatabaseTransaction,
    ): Promise<void> {
      const listIds = [...new Set(placements.map(({ listId }) => listId))].sort(compareOrdinal);
      for (const listId of listIds) {
        const list = await repositories.lists.lockById(userId, listId, transaction);
        if (!list || list.deletedAt !== null) {
          await rejectContainerLockMiss(repositories.tasks, userId, observedTask, transaction);
        }
      }

      const sections = new Map(
        placements.flatMap(({ listId, sectionId }) =>
          sectionId === null ? [] : [[`${listId}:${sectionId}`, { listId, sectionId }] as const],
        ),
      );
      const orderedSections = [...sections].sort(([left], [right]) => compareOrdinal(left, right));
      for (const [, section] of orderedSections) {
        if (!(await repositories.sections.lockById(userId, section.listId, section.sectionId, transaction))) {
          await rejectContainerLockMiss(repositories.tasks, userId, observedTask, transaction);
        }
      }
    },

    async lockTasks(
      userId: string,
      ids: readonly string[],
      transaction: DatabaseTransaction,
    ): Promise<Map<string, StoredTask | null>> {
      const locked = new Map<string, StoredTask | null>();
      for (const id of [...new Set(ids)].sort(compareOrdinal)) {
        locked.set(id, await repositories.tasks.lockById(userId, id, "any", transaction));
      }
      return locked;
    },
  };
}

async function rejectContainerLockMiss(
  tasks: TaskRepository,
  userId: string,
  observed: StoredTask,
  transaction: DatabaseTransaction,
): Promise<never> {
  const current = await tasks.findById(userId, observed.id, "any", transaction);
  if (!current) throw taskResourceNotFound();
  if (taskObservationChanged(observed, current)) throw staleTaskResource(current.version);
  throw taskResourceNotFound();
}

function taskObservationChanged(observed: StoredTask, current: StoredTask): boolean {
  return (
    observed.version !== current.version ||
    observed.status !== current.status ||
    observed.deletedAt?.getTime() !== current.deletedAt?.getTime() ||
    observed.listId !== current.listId ||
    observed.sectionId !== current.sectionId ||
    observed.parentTaskId !== current.parentTaskId
  );
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
