import type { HabitGoal, HabitLogValue } from "./contracts";
import { habitConflict, habitNotFound, habitValidationFailed, staleHabit } from "./habit-errors";
import { toDomainGoal } from "./habit-mapper";
import { normalizeHabitDayLog } from "../domain/habit-day-policy";
import type { StoredHabitLog } from "../infrastructure/habit-log-repository";
import type { HabitWriteResult, StoredHabit } from "../infrastructure/habit-repository";

export function assertActiveHabit(
  habit: StoredHabit | null,
  expectedVersion?: number,
): asserts habit is StoredHabit {
  if (!habit) throw habitNotFound();
  if (habit.archivedAt !== null) throw habitConflict("Restore this habit before changing it.", habit.version);
  if (expectedVersion !== undefined && habit.version !== expectedVersion) throw staleHabit(habit.version);
}

export function assertArchivedHabit(
  habit: StoredHabit | null,
  expectedVersion: number,
): asserts habit is StoredHabit {
  if (!habit) throw habitNotFound();
  if (habit.archivedAt === null) throw habitConflict("This habit is already active.", habit.version);
  if (habit.version !== expectedVersion) throw staleHabit(habit.version);
}

export function requireHabitWrite(result: HabitWriteResult): StoredHabit {
  if (result.outcome === "applied") return result.habit;
  if (result.outcome === "not-found") throw habitNotFound();
  if (result.outcome === "stale") throw staleHabit(result.currentVersion);
  throw habitConflict(
    result.lifecycle === "archived"
      ? "Restore this habit before changing it."
      : "The habit lifecycle changed while this request was running.",
    result.currentVersion,
  );
}

export function validatedLogValue(goal: HabitGoal, value: HabitLogValue): HabitLogValue {
  try {
    const normalized = normalizeHabitDayLog(toDomainGoal(goal), {
      localDate: "2000-01-01",
      state: value.state,
      quantity: value.quantity,
      note: value.note,
    });
    if (normalized.state === "completed") {
      return { state: "completed", quantity: normalized.quantity, note: normalized.note };
    }
    if (normalized.state === "skipped") {
      return { state: "skipped", quantity: null, note: normalized.note };
    }
    return { state: "unachieved", quantity: null, note: normalized.note };
  } catch (error) {
    throw habitValidationFailed(error instanceof Error ? error.message : "The habit log is invalid.");
  }
}

export function sameStoredLogValue(log: StoredHabitLog, value: HabitLogValue): boolean {
  return log.state === value.state && log.quantity === value.quantity && log.note === value.note;
}
