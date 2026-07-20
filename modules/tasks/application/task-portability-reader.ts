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
    recurrenceDefinitions: rows.recurrenceDefinitions.map(mapRecurrenceDefinition),
    occurrenceEvents: rows.occurrenceEvents.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      occurrenceKey: row.occurrenceKey,
      state: row.state,
      taskVersion: row.taskVersion,
      effectiveAt: row.effectiveAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
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

function mapRecurrenceDefinition(
  row: Readonly<{
    taskId: string;
    rrule: string;
    timezone: string;
    generationMode: string;
    projectionStartDate: string | null;
    projectionStartAt: Date | null;
    projectionEndDate: string | null;
    projectionEndAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
) {
  const common = {
    taskId: row.taskId,
    rrule: row.rrule,
    timezone: row.timezone,
    generationMode: row.generationMode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.projectionStartDate !== null) {
    if (row.projectionStartAt !== null || row.projectionEndAt !== null) throw invalidRecurrenceCutover();
    return {
      ...common,
      kind: "all_day" as const,
      projectionStartDate: row.projectionStartDate,
      projectionEndDate: row.projectionEndDate,
    };
  }
  if (row.projectionStartAt !== null) {
    if (row.projectionStartDate !== null || row.projectionEndDate !== null) throw invalidRecurrenceCutover();
    return {
      ...common,
      kind: "timed" as const,
      projectionStartAt: row.projectionStartAt.toISOString(),
      projectionEndAt: row.projectionEndAt?.toISOString() ?? null,
    };
  }
  throw invalidRecurrenceCutover();
}

function invalidRecurrenceCutover() {
  return new Error("A stored recurrence has an invalid projection cutover shape.");
}
