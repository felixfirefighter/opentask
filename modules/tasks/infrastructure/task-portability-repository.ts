import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export function createTaskPortabilityRepository(defaultExecutor: DatabaseExecutor) {
  return {
    async readOwned(userId: string, executor: DatabaseExecutor = defaultExecutor) {
      // A transaction owns one pg client. Keep its reads sequential so pg never receives
      // concurrent client.query calls (deprecated in pg 8 and removed in pg 9).
      const folders = await executor
        .select()
        .from(schema.listFolders)
        .where(eq(schema.listFolders.userId, userId))
        .orderBy(asc(schema.listFolders.id));
      const lists = await executor
        .select()
        .from(schema.taskLists)
        .where(eq(schema.taskLists.userId, userId))
        .orderBy(asc(schema.taskLists.id));
      const sections = await executor
        .select()
        .from(schema.listSections)
        .where(eq(schema.listSections.userId, userId))
        .orderBy(asc(schema.listSections.id));
      const tasks = await executor
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.userId, userId))
        .orderBy(asc(schema.tasks.id));
      const schedules = await executor
        .select()
        .from(schema.taskSchedules)
        .where(eq(schema.taskSchedules.userId, userId))
        .orderBy(asc(schema.taskSchedules.taskId));
      const recurrenceDefinitions = await executor
        .select()
        .from(schema.taskRecurrences)
        .where(eq(schema.taskRecurrences.userId, userId))
        .orderBy(asc(schema.taskRecurrences.taskId));
      const occurrenceEvents = await executor
        .select()
        .from(schema.taskOccurrenceEvents)
        .where(eq(schema.taskOccurrenceEvents.userId, userId))
        .orderBy(
          asc(schema.taskOccurrenceEvents.taskId),
          asc(schema.taskOccurrenceEvents.taskVersion),
          asc(schema.taskOccurrenceEvents.id),
        );
      const checklistItems = await executor
        .select()
        .from(schema.checklistItems)
        .where(eq(schema.checklistItems.userId, userId))
        .orderBy(asc(schema.checklistItems.id));
      const tags = await executor
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.userId, userId))
        .orderBy(asc(schema.tags.id));
      const taskTags = await executor
        .select()
        .from(schema.taskTags)
        .where(eq(schema.taskTags.userId, userId))
        .orderBy(asc(schema.taskTags.taskId), asc(schema.taskTags.tagId));

      return {
        folders,
        lists,
        sections,
        tasks,
        schedules,
        recurrenceDefinitions,
        occurrenceEvents,
        checklistItems,
        tags,
        taskTags,
      };
    },
  } as const;
}
