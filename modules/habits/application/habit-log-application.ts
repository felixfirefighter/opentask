import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  editHabitDayRequestSchema,
  habitIdSchema,
  habitLocalDateSchema,
  recordHabitDayRequestSchema,
  recordHabitDayResultSchema,
  undoHabitDayRequestSchema,
  type EditHabitDayRequest,
  type HabitLogDto,
  type RecordHabitDayRequest,
  type RecordHabitDayResult,
  type UndoHabitDayRequest,
} from "./contracts";
import { assertActiveHabit, sameStoredLogValue, validatedLogValue } from "./habit-application-support";
import { habitConflict, habitNotFound, habitValidationFailed, staleHabit } from "./habit-errors";
import { mapHabitLog, storedHabitGoal, storedHabitSchedule } from "./habit-mapper";
import { assertHabitDayRecordable } from "../domain/habit-day-policy";
import { localDateAtInstant } from "../domain/habit-time-policy";
import {
  createHabitLogRepository,
  type HabitLogWriteResult,
  type StoredHabitLog,
} from "../infrastructure/habit-log-repository";
import { createHabitRepository } from "../infrastructure/habit-repository";
import { createHabitScheduleRepository } from "../infrastructure/habit-schedule-repository";

export function createHabitLogApplication({ database, clock }: { database: Database; clock: Clock }) {
  const habits = createHabitRepository(database);
  const schedules = createHabitScheduleRepository(database);
  const logs = createHabitLogRepository(database);

  return {
    async recordHabitDay(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawResourceId: string,
      rawInput: RecordHabitDayRequest,
    ): Promise<RecordHabitDayResult> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const resourceId = habitIdSchema.parse(rawResourceId);
      const input = recordHabitDayRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const habit = await habits.lockById(actor.userId, habitId, transaction);
        assertActiveHabit(habit);
        const scheduleRow = await schedules.lockByHabitId(actor.userId, habitId, transaction);
        if (!scheduleRow) throw new Error("A stored habit is missing its required schedule.");
        const schedule = storedHabitSchedule(scheduleRow);
        const now = clock.now();
        const currentLocalDate = localDateAtInstant(now.toISOString(), schedule.timezone);
        try {
          assertHabitDayRecordable(schedule, input.localDate, currentLocalDate);
        } catch (error) {
          throw habitValidationFailed(
            error instanceof Error ? error.message : "The habit day cannot be recorded.",
          );
        }
        const goal = storedHabitGoal(habit);
        const value = validatedLogValue(goal, input.value);

        const replayById = await logs.lockById(actor.userId, resourceId, transaction);
        if (replayById) return logReplay(replayById, resourceId, habitId, input.localDate, value, goal);
        const existingDay = await logs.lockByHabitDate(actor.userId, habitId, input.localDate, transaction);
        if (existingDay) return logReplay(existingDay, resourceId, habitId, input.localDate, value, goal);

        const created = await logs.insert(
          {
            id: resourceId,
            userId: actor.userId,
            habitId,
            localDate: input.localDate,
            value,
            now,
          },
          transaction,
        );
        if (created) {
          return recordHabitDayResultSchema.parse({
            outcome: "created",
            log: mapHabitLog(created, goal),
          });
        }
        const winnerById = await logs.lockById(actor.userId, resourceId, transaction);
        const winner =
          winnerById ?? (await logs.lockByHabitDate(actor.userId, habitId, input.localDate, transaction));
        if (!winner) throw habitConflict("The habit day could not be reserved safely.");
        return logReplay(winner, resourceId, habitId, input.localDate, value, goal);
      });
    },

    async editHabitDay(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawLocalDate: string,
      rawInput: EditHabitDayRequest,
    ): Promise<HabitLogDto> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const localDate = habitLocalDateSchema.parse(rawLocalDate);
      const input = editHabitDayRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const habit = await habits.lockById(actor.userId, habitId, transaction);
        assertActiveHabit(habit);
        const current = await logs.lockByHabitDate(actor.userId, habitId, localDate, transaction);
        if (!current) throw habitNotFound();
        if (current.version !== input.expectedVersion) throw staleHabit(current.version);
        const goal = storedHabitGoal(habit);
        const value = validatedLogValue(goal, input.value);
        const updated = requireLogWrite(
          await logs.update(
            {
              userId: actor.userId,
              habitId,
              localDate,
              expectedVersion: input.expectedVersion,
              value,
              now: clock.now(),
            },
            transaction,
          ),
        );
        return mapHabitLog(updated, goal);
      });
    },

    async undoHabitDay(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawLocalDate: string,
      rawInput: UndoHabitDayRequest,
    ): Promise<HabitLogDto> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const localDate = habitLocalDateSchema.parse(rawLocalDate);
      const input = undoHabitDayRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const habit = await habits.lockById(actor.userId, habitId, transaction);
        assertActiveHabit(habit);
        const current = await logs.lockByHabitDate(actor.userId, habitId, localDate, transaction);
        if (!current) throw habitNotFound();
        if (current.version !== input.expectedVersion) throw staleHabit(current.version);
        const removed = requireLogWrite(
          await logs.remove(
            { userId: actor.userId, habitId, localDate, expectedVersion: input.expectedVersion },
            transaction,
          ),
        );
        return mapHabitLog(removed, storedHabitGoal(habit));
      });
    },
  } as const;
}

function logReplay(
  existing: StoredHabitLog,
  resourceId: string,
  habitId: string,
  localDate: string,
  value: Parameters<typeof sameStoredLogValue>[1],
  goal: Parameters<typeof mapHabitLog>[1],
): RecordHabitDayResult {
  if (
    existing.id !== resourceId ||
    existing.habitId !== habitId ||
    existing.localDate !== localDate ||
    !sameStoredLogValue(existing, value)
  ) {
    throw habitConflict(
      "A log already exists for this habit day. Review it before trying again.",
      existing.version,
    );
  }
  return recordHabitDayResultSchema.parse({
    outcome: "idempotent_retry",
    log: mapHabitLog(existing, goal),
  });
}

function requireLogWrite(result: HabitLogWriteResult): StoredHabitLog {
  if (result.outcome === "applied") return result.log;
  if (result.outcome === "not-found") throw habitNotFound();
  throw staleHabit(result.currentVersion);
}
