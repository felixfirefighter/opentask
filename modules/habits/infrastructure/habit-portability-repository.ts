import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export function createHabitPortabilityRepository(defaultExecutor: DatabaseExecutor) {
  return {
    async readOwned(userId: string, executor: DatabaseExecutor = defaultExecutor) {
      // A transaction owns one pg client, so keep reads sequential.
      const habits = await executor
        .select()
        .from(schema.habits)
        .where(eq(schema.habits.userId, userId))
        .orderBy(asc(schema.habits.id));
      const schedules = await executor
        .select()
        .from(schema.habitSchedules)
        .where(eq(schema.habitSchedules.userId, userId))
        .orderBy(asc(schema.habitSchedules.habitId));
      const logs = await executor
        .select()
        .from(schema.habitLogs)
        .where(eq(schema.habitLogs.userId, userId))
        .orderBy(asc(schema.habitLogs.habitId), asc(schema.habitLogs.localDate), asc(schema.habitLogs.id));
      return { habits, schedules, logs } as const;
    },
  } as const;
}
