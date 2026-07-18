import { and, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

const activeRootTasks = alias(schema.tasks, "active_root_tasks");
const activeDestinationLists = alias(schema.taskLists, "active_destination_lists");

type StoredTask = typeof schema.tasks.$inferSelect;
type TreeTaskChanges = Partial<Pick<StoredTask, "listId" | "sectionId" | "deletedAt">>;

export function createTaskTreeRepository(defaultExecutor: DatabaseExecutor) {
  return {
    moveDirectSubtasks(
      input: {
        userId: string;
        rootTaskId: string;
        sourceListId: string;
        destinationListId: string;
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateDirectSubtasks(
        input,
        { listId: input.destinationListId, sectionId: null },
        eq(schema.tasks.listId, input.sourceListId),
        executor,
      );
    },

    async moveAllActiveTaskTreesBetweenLists(
      input: { userId: string; sourceListId: string; destinationListId: string; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      if (input.sourceListId === input.destinationListId) {
        throw new RangeError("Source and destination task lists must differ.");
      }
      const roots = executor
        .select({ id: activeRootTasks.id })
        .from(activeRootTasks)
        .where(
          and(
            eq(activeRootTasks.userId, input.userId),
            eq(activeRootTasks.listId, input.sourceListId),
            isNull(activeRootTasks.parentTaskId),
            isNull(activeRootTasks.deletedAt),
          ),
        );
      const destinationExists = executor
        .select({ id: activeDestinationLists.id })
        .from(activeDestinationLists)
        .where(
          and(
            eq(activeDestinationLists.userId, input.userId),
            eq(activeDestinationLists.id, input.destinationListId),
            isNull(activeDestinationLists.deletedAt),
          ),
        );
      return executor
        .update(schema.tasks)
        .set({
          listId: input.destinationListId,
          sectionId: null,
          updatedAt: input.now,
          version: sql`${schema.tasks.version} + 1`,
        })
        .where(
          and(
            eq(schema.tasks.userId, input.userId),
            eq(schema.tasks.listId, input.sourceListId),
            exists(destinationExists),
            or(isNull(schema.tasks.deletedAt), inArray(schema.tasks.parentTaskId, roots)),
          ),
        )
        .returning();
    },

    softDeleteActiveDirectSubtasks(
      input: { userId: string; rootTaskId: string; deletionInstant: Date; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateDirectSubtasks(
        input,
        { deletedAt: input.deletionInstant },
        isNull(schema.tasks.deletedAt),
        executor,
      );
    },

    restoreDirectSubtasksFromDeletion(
      input: { userId: string; rootTaskId: string; deletionInstant: Date; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateDirectSubtasks(
        input,
        { deletedAt: null },
        eq(schema.tasks.deletedAt, input.deletionInstant),
        executor,
      );
    },
  };
}

function mutateDirectSubtasks(
  input: { userId: string; rootTaskId: string; now: Date },
  changes: TreeTaskChanges,
  additionalPredicate: SQL,
  executor: DatabaseExecutor,
) {
  return executor
    .update(schema.tasks)
    .set({ ...changes, updatedAt: input.now, version: sql`${schema.tasks.version} + 1` })
    .where(
      and(
        eq(schema.tasks.userId, input.userId),
        eq(schema.tasks.parentTaskId, input.rootTaskId),
        additionalPredicate,
      ),
    )
    .returning();
}
