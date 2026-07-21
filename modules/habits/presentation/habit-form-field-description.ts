import type { HabitFormDraft } from "./habit-form-policy";

export function habitFieldDescription(
  field: keyof HabitFormDraft,
  hintId: string,
  errorField: keyof HabitFormDraft | null,
  errorMessageId?: string,
): string {
  return [hintId, habitFieldErrorDescription(field, errorField, errorMessageId)].filter(Boolean).join(" ");
}

export function habitFieldErrorDescription(
  field: keyof HabitFormDraft,
  errorField: keyof HabitFormDraft | null,
  errorMessageId?: string,
): string | undefined {
  return field === errorField ? errorMessageId : undefined;
}
