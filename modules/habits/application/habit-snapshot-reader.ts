import type { Database } from "@/shared/db/client";

import { habitIdSchema, type HabitSnapshotReader } from "./contracts";
import { createHabitRepository } from "../infrastructure/habit-repository";

export function createHabitSnapshotReader(database: Database): HabitSnapshotReader {
  const habits = createHabitRepository(database);
  return {
    async readOwned(actor, rawHabitId, executor = database) {
      const habitId = habitIdSchema.parse(rawHabitId);
      const habit = await habits.findById(actor.userId, habitId, executor);
      return habit
        ? {
            id: habit.id,
            title: habit.title,
            version: habit.version,
            archived: habit.archivedAt !== null,
          }
        : null;
    },
  };
}
