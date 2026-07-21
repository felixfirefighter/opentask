import { eq, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { HabitDefinitionWrite } from "./habit-repository";
import type { HabitScheduleWrite } from "./habit-schedule-repository";
import type { HabitLogWrite } from "./habit-log-repository";

export type DemoHabitRecord = Readonly<{
  id: string;
  definition: HabitDefinitionWrite;
  version: number;
  archivedAt: Date | null;
}>;

export type DemoHabitScheduleRecord = Readonly<{
  habitId: string;
  schedule: HabitScheduleWrite;
}>;

export type DemoHabitLogRecord = Readonly<{
  id: string;
  habitId: string;
  localDate: string;
  value: HabitLogWrite;
}>;

export type DemoHabitDataset = Readonly<{
  resetAt: Date;
  habits: readonly DemoHabitRecord[];
  schedules: readonly DemoHabitScheduleRecord[];
  logs: readonly DemoHabitLogRecord[];
}>;

export function createDemoHabitRepository() {
  return {
    async lockOwner(userId: string, executor: DatabaseExecutor): Promise<void> {
      await executor.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`opentask:demo-reset:${userId}`}, 0))`,
      );
    },

    async replaceOwned(userId: string, dataset: DemoHabitDataset, executor: DatabaseExecutor): Promise<void> {
      await executor.delete(schema.habits).where(eq(schema.habits.userId, userId));
      if (dataset.habits.length > 0) {
        await executor.insert(schema.habits).values(
          dataset.habits.map((habit) => ({
            id: habit.id,
            userId,
            ...habit.definition,
            version: habit.version,
            createdAt: dataset.resetAt,
            updatedAt: dataset.resetAt,
            archivedAt: habit.archivedAt,
          })),
        );
      }
      if (dataset.schedules.length > 0) {
        await executor.insert(schema.habitSchedules).values(
          dataset.schedules.map(({ habitId, schedule }) => ({
            userId,
            habitId,
            ...schedule,
            createdAt: dataset.resetAt,
            updatedAt: dataset.resetAt,
          })),
        );
      }
      if (dataset.logs.length > 0) {
        await executor.insert(schema.habitLogs).values(
          dataset.logs.map((log) => ({
            id: log.id,
            userId,
            habitId: log.habitId,
            localDate: log.localDate,
            ...log.value,
            version: 1,
            createdAt: dataset.resetAt,
            updatedAt: dataset.resetAt,
          })),
        );
      }
    },
  } as const;
}
