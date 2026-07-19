import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export function createTaskPortabilityRepository(defaultExecutor: DatabaseExecutor) {
  return {
    readOwned(userId: string, executor: DatabaseExecutor = defaultExecutor) {
      return Promise.all([
        executor
          .select()
          .from(schema.listFolders)
          .where(eq(schema.listFolders.userId, userId))
          .orderBy(asc(schema.listFolders.id)),
        executor
          .select()
          .from(schema.taskLists)
          .where(eq(schema.taskLists.userId, userId))
          .orderBy(asc(schema.taskLists.id)),
        executor
          .select()
          .from(schema.listSections)
          .where(eq(schema.listSections.userId, userId))
          .orderBy(asc(schema.listSections.id)),
        executor
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.userId, userId))
          .orderBy(asc(schema.tasks.id)),
        executor
          .select()
          .from(schema.taskSchedules)
          .where(eq(schema.taskSchedules.userId, userId))
          .orderBy(asc(schema.taskSchedules.taskId)),
        executor
          .select()
          .from(schema.checklistItems)
          .where(eq(schema.checklistItems.userId, userId))
          .orderBy(asc(schema.checklistItems.id)),
        executor
          .select()
          .from(schema.tags)
          .where(eq(schema.tags.userId, userId))
          .orderBy(asc(schema.tags.id)),
        executor
          .select()
          .from(schema.taskTags)
          .where(eq(schema.taskTags.userId, userId))
          .orderBy(asc(schema.taskTags.taskId), asc(schema.taskTags.tagId)),
      ]).then(([folders, lists, sections, tasks, schedules, checklistItems, tags, taskTags]) => ({
        folders,
        lists,
        sections,
        tasks,
        schedules,
        checklistItems,
        tags,
        taskTags,
      }));
    },
  } as const;
}
