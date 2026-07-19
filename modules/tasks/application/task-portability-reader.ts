import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { mapSchedule } from "./schedule-application";
import { createTaskPortabilityRepository } from "../infrastructure/task-portability-repository";

export async function readPortableTasks(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const rows = await createTaskPortabilityRepository(executor).readOwned(actor.userId);
  const versioned = (row: { version: number; createdAt: Date; updatedAt: Date }) => ({
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
  const softDeleted = (row: { deletedAt: Date | null }) => ({
    deletedAt: row.deletedAt?.toISOString() ?? null,
  });

  return {
    folders: rows.folders.map((row) => ({
      id: row.id,
      name: row.name,
      rank: row.rank,
      ...versioned(row),
      ...softDeleted(row),
    })),
    lists: rows.lists.map((row) => ({
      id: row.id,
      folderId: row.folderId,
      name: row.name,
      colorToken: row.colorToken,
      rank: row.rank,
      kind: row.kind,
      ...versioned(row),
      ...softDeleted(row),
    })),
    sections: rows.sections.map((row) => ({
      id: row.id,
      listId: row.listId,
      name: row.name,
      rank: row.rank,
      ...versioned(row),
    })),
    tasks: rows.tasks.map((row) => ({
      id: row.id,
      listId: row.listId,
      sectionId: row.sectionId,
      parentTaskId: row.parentTaskId,
      title: row.title,
      descriptionMd: row.descriptionMd,
      status: row.status,
      priority: row.priority,
      rank: row.rank,
      statusChangedAt: row.statusChangedAt.toISOString(),
      ...versioned(row),
      ...softDeleted(row),
    })),
    schedules: rows.schedules.map(mapSchedule),
    checklistItems: rows.checklistItems.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      title: row.title,
      isCompleted: row.isCompleted,
      rank: row.rank,
      ...versioned(row),
    })),
    tags: rows.tags.map((row) => ({
      id: row.id,
      name: row.name,
      colorToken: row.colorToken,
      ...versioned(row),
      ...softDeleted(row),
    })),
    taskTags: rows.taskTags.map(({ taskId, tagId }) => ({ taskId, tagId })),
  } as const;
}
