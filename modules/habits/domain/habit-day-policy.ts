import type { HabitGoal } from "./habit-goal-policy";
import { normalizeHabitGoal, normalizeHabitQuantity } from "./habit-goal-policy";
import type { HabitSchedule } from "./habit-schedule-policy";
import { isHabitScheduledOnDate } from "./habit-schedule-policy";
import { normalizeHabitNote } from "./habit-text";
import { canonicalHabitLocalDate, compareHabitLocalDates } from "./habit-time-policy";

export type HabitLogState = "completed" | "skipped" | "unachieved";

export type HabitLogValue = Readonly<{
  state: HabitLogState;
  quantity: number | null;
  note: string | null;
}>;

export type HabitDayLog = HabitLogValue & Readonly<{ localDate: string }>;

export type NormalizedHabitLogValue =
  | Readonly<{ state: "completed"; quantity: number | null; note: string | null }>
  | Readonly<{ state: "skipped"; quantity: null; note: string | null }>
  | Readonly<{ state: "unachieved"; quantity: null; note: string | null }>;

export type NormalizedHabitDayLog = NormalizedHabitLogValue & Readonly<{ localDate: string }>;

export type HabitLogForProjection = Readonly<{
  localDate: string;
  state: HabitLogState;
  quantity: number | null;
}>;

export type HabitDayOutcome = "successful" | "partial" | "skipped" | "unachieved";

export function normalizeHabitLogValue(goal: HabitGoal, value: HabitLogValue): NormalizedHabitLogValue {
  const normalizedGoal = normalizeHabitGoal(goal);
  const note = value.note === null ? null : normalizeHabitNote(value.note);

  if (value.state === "completed") {
    if (normalizedGoal.goalKind === "boolean") {
      if (value.quantity !== null) {
        throw new RangeError("A completed boolean habit cannot have a quantity.");
      }
      return { state: "completed", quantity: null, note };
    }
    if (value.quantity === null) {
      throw new RangeError("A completed quantity habit requires a quantity.");
    }
    return { state: "completed", quantity: normalizeHabitQuantity(value.quantity), note };
  }

  if (value.state !== "skipped" && value.state !== "unachieved") {
    throw new RangeError("The habit log state is invalid.");
  }
  if (value.quantity !== null) {
    throw new RangeError("Skipped and unachieved habit logs cannot have a quantity.");
  }
  return { state: value.state, quantity: null, note };
}

export function normalizeHabitDayLog(goal: HabitGoal, log: HabitDayLog): NormalizedHabitDayLog {
  return {
    localDate: canonicalHabitLocalDate(log.localDate),
    ...normalizeHabitLogValue(goal, log),
  };
}

export function isSuccessfulHabitLog(
  goal: HabitGoal,
  log: Pick<HabitLogForProjection, "state" | "quantity">,
): boolean {
  const normalizedGoal = normalizeHabitGoal(goal);
  if (log.state !== "completed") return false;
  if (normalizedGoal.goalKind === "boolean") return true;
  if (log.quantity === null) return false;
  return normalizeHabitQuantity(log.quantity) >= normalizedGoal.targetValue;
}

export function classifyHabitDay(goal: HabitGoal, log: HabitLogForProjection): HabitDayOutcome {
  if (log.state === "skipped" || log.state === "unachieved") return log.state;
  return isSuccessfulHabitLog(goal, log) ? "successful" : "partial";
}

export function assertHabitDayRecordable(
  schedule: HabitSchedule,
  localDate: string,
  currentLocalDate: string,
): void {
  const date = canonicalHabitLocalDate(localDate);
  const current = canonicalHabitLocalDate(currentLocalDate, "Current habit local date");
  if (compareHabitLocalDates(date, current) > 0) {
    throw new RangeError("A habit log cannot be created for a future local date.");
  }
  if (!isHabitScheduledOnDate(schedule, date)) {
    throw new RangeError("The habit is not scheduled on that local date.");
  }
}
