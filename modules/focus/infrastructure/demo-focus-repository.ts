import { eq, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type DemoFocusSession = Readonly<{
  id: string;
  taskId: string | null;
  habitId: string | null;
  kind: "focus" | "break";
  mode: "pomodoro" | "stopwatch";
  state: "completed";
  startedAt: Date;
  pausedAt: null;
  accumulatedActiveSeconds: number;
  plannedSeconds: number | null;
  endedAt: Date;
  version: number;
}>;

export function createDemoFocusRepository() {
  return {
    async lockOwner(userId: string, executor: DatabaseExecutor): Promise<void> {
      await executor.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`opentask:demo-reset:${userId}`}, 0))`,
      );
    },

    async clearOwned(userId: string, executor: DatabaseExecutor): Promise<void> {
      await executor.delete(schema.focusSessions).where(eq(schema.focusSessions.userId, userId));
    },

    async seedOwned(
      userId: string,
      resetAt: Date,
      sessions: readonly DemoFocusSession[],
      executor: DatabaseExecutor,
    ): Promise<void> {
      if (sessions.length === 0) return;
      await executor.insert(schema.focusSessions).values(
        sessions.map((session) => ({
          ...session,
          userId,
          createdAt: session.startedAt,
          updatedAt: session.endedAt ?? resetAt,
        })),
      );
    },
  } as const;
}
