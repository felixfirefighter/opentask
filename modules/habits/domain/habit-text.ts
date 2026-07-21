import {
  HABIT_ICON_MAX_CODE_POINTS,
  HABIT_NOTE_MAX_CODE_POINTS,
  HABIT_TITLE_MAX_CODE_POINTS,
  HABIT_UNIT_MAX_CODE_POINTS,
} from "./habit-limits";

export type HabitTextField = "title" | "icon" | "unit" | "note";

export class HabitTextError extends Error {
  readonly field: HabitTextField;
  readonly reason: "BLANK" | "TOO_LONG" | "UNSAFE";

  constructor(field: HabitTextField, reason: HabitTextError["reason"]) {
    super(
      `The habit ${field} is ${
        reason === "BLANK" ? "blank" : reason === "TOO_LONG" ? "too long" : "not safe to store"
      }.`,
    );
    this.name = "HabitTextError";
    this.field = field;
    this.reason = reason;
  }
}

export function normalizeHabitTitle(value: string): string {
  return normalizeRequiredHabitText(value, "title", HABIT_TITLE_MAX_CODE_POINTS);
}

export function normalizeHabitIcon(value: string): string {
  return normalizeRequiredHabitText(value, "icon", HABIT_ICON_MAX_CODE_POINTS);
}

export function normalizeHabitUnit(value: string): string {
  return normalizeRequiredHabitText(value, "unit", HABIT_UNIT_MAX_CODE_POINTS);
}

export function normalizeHabitNote(value: string): string {
  assertSafeHabitText(value, "note");
  const normalized = value.normalize("NFC");
  if (unicodeCodePointLength(normalized) > HABIT_NOTE_MAX_CODE_POINTS) {
    throw new HabitTextError("note", "TOO_LONG");
  }
  return normalized;
}

export function isDatabaseSafeHabitText(value: string): boolean {
  return value.isWellFormed() && !value.includes("\0");
}

function normalizeRequiredHabitText(
  value: string,
  field: Exclude<HabitTextField, "note">,
  maximumCodePoints: number,
): string {
  assertSafeHabitText(value, field);
  const normalized = value.normalize("NFC").trim();
  if (normalized.length === 0) throw new HabitTextError(field, "BLANK");
  if (unicodeCodePointLength(normalized) > maximumCodePoints) {
    throw new HabitTextError(field, "TOO_LONG");
  }
  return normalized;
}

function assertSafeHabitText(value: string, field: HabitTextField): void {
  if (!isDatabaseSafeHabitText(value)) throw new HabitTextError(field, "UNSAFE");
}

function unicodeCodePointLength(value: string): number {
  return Array.from(value).length;
}
