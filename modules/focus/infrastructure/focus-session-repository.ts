import { and, desc, eq, gte, isNotNull, lt, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type StoredFocusSession = typeof schema.focusSessions.$inferSelect;

export type FocusSessionWrite = Readonly<{
  state: "active" | "paused" | "completed";
  startedAt: Date;
  pausedAt: Date | null;
  accumulatedActiveSeconds: number;
  endedAt: Date | null;
}>;

export type FocusHistoryAfter = Readonly<{ endedAt: Date; id: string }>;

export function createFocusSessionRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async lockStartScope(userId: string, executor: DatabaseExecutor = defaultExecutor): Promise<void> {
      const key = `opentask:focus:start:${userId}`;
      await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    },

    async findById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredFocusSession | null> {
      const [row] = await executor
        .select()
        .from(schema.focusSessions)
        .where(and(eq(schema.focusSessions.userId, userId), eq(schema.focusSessions.id, id)))
        .limit(1);
      return row ?? null;
    },

    async lockById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredFocusSession | null> {
      const [row] = await executor
        .select()
        .from(schema.focusSessions)
        .where(and(eq(schema.focusSessions.userId, userId), eq(schema.focusSessions.id, id)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async findUnfinished(
      userId: string,
      executor: DatabaseExecutor = defaultExecutor,
      lock = false,
    ): Promise<StoredFocusSession | null> {
      const selection = executor
        .select()
        .from(schema.focusSessions)
        .where(
          and(
            eq(schema.focusSessions.userId, userId),
            or(eq(schema.focusSessions.state, "active"), eq(schema.focusSessions.state, "paused")),
          ),
        )
        .limit(1);
      const [row] = lock ? await selection.for("update") : await selection;
      return row ?? null;
    },

    async insert(
      input: Readonly<{
        id: string;
        userId: string;
        taskId: string | null;
        habitId: string | null;
        kind: "focus" | "break";
        mode: "pomodoro" | "stopwatch";
        plannedSeconds: number | null;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredFocusSession | null> {
      const [row] = await executor
        .insert(schema.focusSessions)
        .values({
          ...input,
          state: "active",
          startedAt: input.now,
          pausedAt: null,
          accumulatedActiveSeconds: 0,
          endedAt: null,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: [schema.focusSessions.userId, schema.focusSessions.id] })
        .returning();
      return row ?? null;
    },

    async writeState(
      input: Readonly<{
        userId: string;
        id: string;
        expectedVersion: number;
        value: FocusSessionWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredFocusSession | null> {
      const [row] = await executor
        .update(schema.focusSessions)
        .set({
          ...input.value,
          version: sql`${schema.focusSessions.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.focusSessions.userId, input.userId),
            eq(schema.focusSessions.id, input.id),
            eq(schema.focusSessions.version, input.expectedVersion),
          ),
        )
        .returning();
      return row ?? null;
    },

    async correctCompleted(
      input: Readonly<{
        userId: string;
        id: string;
        expectedVersion: number;
        accumulatedActiveSeconds: number;
        taskId: string | null;
        habitId: string | null;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredFocusSession | null> {
      const [row] = await executor
        .update(schema.focusSessions)
        .set({
          accumulatedActiveSeconds: input.accumulatedActiveSeconds,
          taskId: input.taskId,
          habitId: input.habitId,
          version: sql`${schema.focusSessions.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.focusSessions.userId, input.userId),
            eq(schema.focusSessions.id, input.id),
            eq(schema.focusSessions.version, input.expectedVersion),
            eq(schema.focusSessions.kind, "focus"),
            eq(schema.focusSessions.state, "completed"),
          ),
        )
        .returning();
      return row ?? null;
    },

    async remove(
      input: Readonly<{
        userId: string;
        id: string;
        expectedVersion: number;
        lifecycle: "unfinished" | "completed-focus";
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredFocusSession | null> {
      const lifecycle =
        input.lifecycle === "unfinished"
          ? or(eq(schema.focusSessions.state, "active"), eq(schema.focusSessions.state, "paused"))
          : and(eq(schema.focusSessions.state, "completed"), eq(schema.focusSessions.kind, "focus"));
      const [row] = await executor
        .delete(schema.focusSessions)
        .where(
          and(
            eq(schema.focusSessions.userId, input.userId),
            eq(schema.focusSessions.id, input.id),
            eq(schema.focusSessions.version, input.expectedVersion),
            lifecycle,
          ),
        )
        .returning();
      return row ?? null;
    },

    async listCompletedFocus(
      userId: string,
      query: Readonly<{ limit: number; after?: FocusHistoryAfter }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredFocusSession[]> {
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 51) {
        throw new RangeError("Focus history repository limit must be from 1 through 51.");
      }
      return executor
        .select()
        .from(schema.focusSessions)
        .where(
          and(
            eq(schema.focusSessions.userId, userId),
            eq(schema.focusSessions.kind, "focus"),
            eq(schema.focusSessions.state, "completed"),
            isNotNull(schema.focusSessions.endedAt),
            query.after
              ? or(
                  lt(schema.focusSessions.endedAt, query.after.endedAt),
                  and(
                    eq(schema.focusSessions.endedAt, query.after.endedAt),
                    lt(schema.focusSessions.id, query.after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(schema.focusSessions.endedAt), desc(schema.focusSessions.id))
        .limit(query.limit);
    },

    async findCompletedFocusAnchor(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<Pick<StoredFocusSession, "id" | "endedAt"> | null> {
      const [row] = await executor
        .select({ id: schema.focusSessions.id, endedAt: schema.focusSessions.endedAt })
        .from(schema.focusSessions)
        .where(
          and(
            eq(schema.focusSessions.userId, userId),
            eq(schema.focusSessions.id, id),
            eq(schema.focusSessions.kind, "focus"),
            eq(schema.focusSessions.state, "completed"),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async sumCompletedFocusByLocalDate(
      userId: string,
      timezone: string,
      range: Readonly<{ startAt: Date; endAt: Date }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<readonly { localDate: string; totalSeconds: number }[]> {
      const completed = executor
        .select({
          localDate: sql<string>`(${schema.focusSessions.endedAt} at time zone ${timezone})::date`.as(
            "local_date",
          ),
          seconds: schema.focusSessions.accumulatedActiveSeconds,
        })
        .from(schema.focusSessions)
        .where(
          and(
            eq(schema.focusSessions.userId, userId),
            eq(schema.focusSessions.kind, "focus"),
            eq(schema.focusSessions.state, "completed"),
            gte(schema.focusSessions.endedAt, range.startAt),
            lt(schema.focusSessions.endedAt, range.endAt),
          ),
        )
        .as("completed_focus_local_date_source");
      return executor
        .select({
          localDate: completed.localDate,
          totalSeconds: sql<number>`sum(${completed.seconds})`.mapWith(Number),
        })
        .from(completed)
        .groupBy(completed.localDate)
        .orderBy(completed.localDate);
    },
  } as const;
}
