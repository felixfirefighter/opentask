import { HABIT_DECIMAL_MAX, HABIT_DECIMAL_MIN, HABIT_DECIMAL_SCALE } from "./habit-limits";
import { normalizeHabitUnit } from "./habit-text";

export type HabitGoal =
  | Readonly<{ goalKind: "boolean"; targetValue: null; unit: null }>
  | Readonly<{ goalKind: "quantity"; targetValue: number; unit: string }>;

export function normalizeHabitGoal(goal: HabitGoal): HabitGoal {
  if (goal.goalKind === "boolean") {
    if (goal.targetValue !== null || goal.unit !== null) {
      throw new RangeError("A boolean habit cannot have a quantity target or unit.");
    }
    return { goalKind: "boolean", targetValue: null, unit: null };
  }

  if (goal.goalKind !== "quantity") {
    throw new RangeError("The habit goal kind is invalid.");
  }

  return {
    goalKind: "quantity",
    targetValue: normalizeHabitTargetValue(goal.targetValue),
    unit: normalizeHabitUnit(goal.unit),
  };
}

export function normalizeHabitTargetValue(value: number): number {
  return normalizeHabitDecimal(value, HABIT_DECIMAL_MIN, "Habit target");
}

export function normalizeHabitQuantity(value: number): number {
  return normalizeHabitDecimal(value, 0, "Habit quantity");
}

function normalizeHabitDecimal(value: number, minimum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > HABIT_DECIMAL_MAX) {
    throw new RangeError(`${label} must be from ${minimum} through ${HABIT_DECIMAL_MAX}.`);
  }

  const factor = 10 ** HABIT_DECIMAL_SCALE;
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  const normalized = rounded / factor;
  if (value !== normalized) {
    throw new RangeError(`${label} may have at most ${HABIT_DECIMAL_SCALE} decimal places.`);
  }
  return normalized;
}
