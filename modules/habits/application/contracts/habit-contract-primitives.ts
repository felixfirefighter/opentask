import { z } from "zod";

import {
  HABIT_COLOR_TOKENS,
  HABIT_PAGE_DEFAULT_ITEMS,
  HABIT_PAGE_MAX_ITEMS,
} from "../../domain/habit-limits";
import { normalizeHabitQuantity, normalizeHabitTargetValue } from "../../domain/habit-goal-policy";
import { canonicalHabitLocalDate } from "../../domain/habit-time-policy";
import {
  normalizeHabitIcon,
  normalizeHabitNote,
  normalizeHabitTitle,
  normalizeHabitUnit,
} from "../../domain/habit-text";

export const habitIdSchema = z.uuidv4().transform((value) => value.toLowerCase());
export const habitVersionSchema = z.number().int().positive().max(2_147_483_647);
export const habitInstantSchema = z.iso.datetime({ offset: true });
export const habitOpaqueCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);
export const habitPageQuerySchema = z.strictObject({
  cursor: habitOpaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(HABIT_PAGE_MAX_ITEMS).default(HABIT_PAGE_DEFAULT_ITEMS),
});
export const habitLocalDateSchema = z.iso
  .date()
  .transform((value, context) => normalize(value, context, canonicalHabitLocalDate));
export const habitColorTokenSchema = z.enum(HABIT_COLOR_TOKENS);

export const habitTitleSchema = normalizedString(normalizeHabitTitle);
export const habitIconSchema = normalizedString(normalizeHabitIcon);
export const habitUnitSchema = normalizedString(normalizeHabitUnit);
export const habitNoteSchema = z
  .string()
  .transform((value, context) => normalize(value, context, normalizeHabitNote));
export const habitTargetValueSchema = z
  .number()
  .transform((value, context) => normalize(value, context, normalizeHabitTargetValue));
export const habitQuantitySchema = z
  .number()
  .transform((value, context) => normalize(value, context, normalizeHabitQuantity));

export const habitExpectedVersionSchema = z.strictObject({ expectedVersion: habitVersionSchema });

function normalizedString(normalizer: (value: string) => string) {
  return z.string().transform((value, context) => normalize(value, context, normalizer));
}

function normalize<T>(value: T, context: z.RefinementCtx, normalizer: (input: T) => T): T {
  try {
    return normalizer(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "The value is invalid.",
    });
    return z.NEVER;
  }
}

export type HabitColorToken = z.infer<typeof habitColorTokenSchema>;
export type HabitPageQuery = z.input<typeof habitPageQuerySchema>;

export {
  HABIT_COLOR_TOKENS,
  HABIT_DECIMAL_MAX,
  HABIT_DECIMAL_MIN,
  HABIT_DECIMAL_SCALE,
  HABIT_ICON_MAX_CODE_POINTS,
  HABIT_NOTE_MAX_CODE_POINTS,
  HABIT_PAGE_DEFAULT_ITEMS,
  HABIT_PAGE_MAX_ITEMS,
  HABIT_TIMEZONE_MAX_CODE_POINTS,
  HABIT_TITLE_MAX_CODE_POINTS,
  HABIT_UNIT_MAX_CODE_POINTS,
  HABIT_WEEKLY_TARGET_MAX,
  HABIT_WEEKLY_TARGET_MIN,
} from "../../domain/habit-limits";
