import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  habitIdSchema,
  setHabitScheduleRequestSchema,
  type HabitDetailDto,
  type SetHabitScheduleRequest,
} from "./contracts";
import { assertActiveHabit, requireHabitWrite } from "./habit-application-support";
import { mapHabitDetail, toScheduleWrite } from "./habit-mapper";
import { createHabitRepository } from "../infrastructure/habit-repository";
import { createHabitScheduleRepository } from "../infrastructure/habit-schedule-repository";

export function createHabitScheduleApplication({ database, clock }: { database: Database; clock: Clock }) {
  const habits = createHabitRepository(database);
  const schedules = createHabitScheduleRepository(database);

  return {
    async setHabitSchedule(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawInput: SetHabitScheduleRequest,
    ): Promise<HabitDetailDto> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const input = setHabitScheduleRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await habits.lockById(actor.userId, habitId, transaction);
        assertActiveHabit(current, input.expectedVersion);
        const existing = await schedules.lockByHabitId(actor.userId, habitId, transaction);
        if (!existing) throw new Error("A stored habit is missing its required schedule.");
        const now = clock.now();
        const schedule = await schedules.replace(
          {
            userId: actor.userId,
            habitId,
            schedule: toScheduleWrite(input.schedule),
            now,
          },
          transaction,
        );
        if (!schedule) throw new Error("The habit schedule disappeared during an authorized update.");
        const updated = requireHabitWrite(
          await habits.incrementVersion(
            { userId: actor.userId, id: habitId, expectedVersion: input.expectedVersion, now },
            transaction,
          ),
        );
        return mapHabitDetail(updated, schedule);
      });
    },
  } as const;
}
