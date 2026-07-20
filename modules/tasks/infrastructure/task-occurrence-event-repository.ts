import { and, desc, eq, inArray } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import {
  MAX_OCCURRENCE_EVENTS_PER_REQUEST,
  MAX_RECURRENCE_ROWS_PER_REQUEST,
} from "../domain/recurrence/recurrence-limits";

export type StoredTaskOccurrenceEvent = typeof schema.taskOccurrenceEvents.$inferSelect;
export type StoredOccurrenceEventPage = Readonly<{
  items: readonly StoredTaskOccurrenceEvent[];
  truncated: boolean;
}>;

export function createTaskOccurrenceEventRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findLatest(
      userId: string,
      taskId: string,
      occurrenceKey: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskOccurrenceEvent | null> {
      const [row] = await executor
        .select()
        .from(schema.taskOccurrenceEvents)
        .where(
          and(
            eq(schema.taskOccurrenceEvents.userId, userId),
            eq(schema.taskOccurrenceEvents.taskId, taskId),
            eq(schema.taskOccurrenceEvents.occurrenceKey, occurrenceKey),
          ),
        )
        .orderBy(desc(schema.taskOccurrenceEvents.taskVersion))
        .limit(1);
      return row ?? null;
    },

    async listLatestForTasks(
      userId: string,
      taskIds: readonly string[],
      limit: number,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredOccurrenceEventPage> {
      if (taskIds.length === 0) return { items: [], truncated: false };
      if (taskIds.length > MAX_RECURRENCE_ROWS_PER_REQUEST || new Set(taskIds).size !== taskIds.length) {
        throw new RangeError(
          `Occurrence event task selection must contain at most ${MAX_RECURRENCE_ROWS_PER_REQUEST} unique IDs.`,
        );
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_OCCURRENCE_EVENTS_PER_REQUEST) {
        throw new RangeError(
          `Occurrence event source limit must be between 1 and ${MAX_OCCURRENCE_EVENTS_PER_REQUEST}.`,
        );
      }
      const rows = await executor
        .selectDistinctOn([schema.taskOccurrenceEvents.taskId, schema.taskOccurrenceEvents.occurrenceKey], {
          event: schema.taskOccurrenceEvents,
        })
        .from(schema.taskOccurrenceEvents)
        .where(
          and(
            eq(schema.taskOccurrenceEvents.userId, userId),
            inArray(schema.taskOccurrenceEvents.taskId, [...taskIds]),
          ),
        )
        .orderBy(
          schema.taskOccurrenceEvents.taskId,
          schema.taskOccurrenceEvents.occurrenceKey,
          desc(schema.taskOccurrenceEvents.taskVersion),
        )
        .limit(limit + 1);
      return { items: rows.slice(0, limit).map(({ event }) => event), truncated: rows.length > limit };
    },

    async append(
      input: Readonly<{
        id: string;
        userId: string;
        taskId: string;
        occurrenceKey: string;
        state: "open" | "completed" | "skipped";
        taskVersion: number;
        effectiveAt: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskOccurrenceEvent> {
      const [row] = await executor
        .insert(schema.taskOccurrenceEvents)
        .values({ ...input, createdAt: input.effectiveAt })
        .returning();
      if (!row) throw new Error("Occurrence event insert did not return the stored row.");
      return row;
    },
  } as const;
}
