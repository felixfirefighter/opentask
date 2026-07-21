export const HABIT_TITLE_MAX_CODE_POINTS = 200;
export const HABIT_ICON_MAX_CODE_POINTS = 16;
export const HABIT_UNIT_MAX_CODE_POINTS = 40;
export const HABIT_NOTE_MAX_CODE_POINTS = 1_000;

export const HABIT_DECIMAL_SCALE = 3;
export const HABIT_DECIMAL_MIN = 0.001;
export const HABIT_DECIMAL_MAX = 999_999_999.999;

export const HABIT_WEEKLY_TARGET_MIN = 1;
export const HABIT_WEEKLY_TARGET_MAX = 7;
export const HABIT_TIMEZONE_MAX_CODE_POINTS = 128;
export const HABIT_PAGE_DEFAULT_ITEMS = 50;
export const HABIT_PAGE_MAX_ITEMS = 100;

export const HABIT_COLOR_TOKENS = ["coral", "amber", "mint", "sky", "violet", "slate"] as const;

export type HabitColorToken = (typeof HABIT_COLOR_TOKENS)[number];

export function isHabitColorToken(value: string): value is HabitColorToken {
  return (HABIT_COLOR_TOKENS as readonly string[]).includes(value);
}

export function assertHabitColorToken(value: string): asserts value is HabitColorToken {
  if (!isHabitColorToken(value)) {
    throw new RangeError("The habit color token is invalid.");
  }
}
