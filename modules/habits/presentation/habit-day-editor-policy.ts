import {
  HABIT_DECIMAL_MAX,
  HABIT_NOTE_MAX_CODE_POINTS,
  type HabitGoal,
  type HabitLogValue,
} from "../application/contracts";

export type HabitDayDraft = Readonly<{
  state: "completed" | "skipped" | "unachieved";
  quantity: string;
  note: string;
}>;

export type HabitDayValidation = Readonly<{ field: "note" | "quantity"; message: string }>;

export function habitDayDraftFromValue(
  value: HabitLogValue | null | undefined,
  goal: HabitGoal,
): HabitDayDraft {
  return {
    state: value?.state ?? "completed",
    quantity:
      value?.state === "completed" && value.quantity != null
        ? String(value.quantity)
        : goal.goalKind === "quantity"
          ? String(goal.targetValue)
          : "",
    note: value?.note ?? "",
  };
}

export function habitDayValueFromDraft(
  draft: HabitDayDraft,
  goal: HabitGoal,
):
  | Readonly<{ success: true; value: HabitLogValue }>
  | Readonly<{ success: false; field: HabitDayValidation["field"]; message: string }> {
  const note = draft.note === "" ? null : draft.note;
  if (Array.from(draft.note).length > HABIT_NOTE_MAX_CODE_POINTS) {
    return {
      success: false,
      field: "note",
      message: `Keep the note to ${HABIT_NOTE_MAX_CODE_POINTS} characters or fewer.`,
    };
  }
  if (draft.state !== "completed") {
    return { success: true, value: { state: draft.state, quantity: null, note } };
  }
  if (goal.goalKind === "boolean") {
    return { success: true, value: { state: "completed", quantity: null, note } };
  }
  if (draft.quantity.trim() === "") {
    return { success: false, field: "quantity", message: "Enter a nonnegative quantity." };
  }
  const quantity = Number(draft.quantity);
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > HABIT_DECIMAL_MAX) {
    return {
      success: false,
      field: "quantity",
      message: `Enter a quantity from 0 through ${HABIT_DECIMAL_MAX}.`,
    };
  }
  return { success: true, value: { state: "completed", quantity, note } };
}
