import { z } from "zod";

import { FOCUS_HISTORY_DEFAULT_ITEMS, FOCUS_HISTORY_MAX_ITEMS } from "../../domain/focus-limits";
import {
  assertFocusVersion,
  assertRecordedFocusSeconds,
  normalizeFocusCorrectionSeconds,
  normalizePlannedSeconds,
} from "../../domain/focus-session-policy";

export const focusIdSchema = z.uuidv4().transform((value) => value.toLowerCase());
export const focusInstantSchema = z.iso.datetime({ offset: true });
export const focusOpaqueCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

export const focusVersionSchema = z
  .number()
  .transform((value, context) =>
    normalize(value, context, (input) => assertAndReturn(input, assertFocusVersion)),
  );
export const focusRecordedSecondsSchema = z
  .number()
  .transform((value, context) =>
    normalize(value, context, (input) => assertAndReturn(input, assertRecordedFocusSeconds)),
  );
export const focusCorrectionSecondsSchema = z
  .number()
  .transform((value, context) => normalize(value, context, normalizeFocusCorrectionSeconds));
export const focusPlannedSecondsSchema = z
  .number()
  .transform((value, context) =>
    normalize(value, context, (input) => normalizePlannedSeconds(input, "focus")),
  );
export const focusBreakSecondsSchema = z
  .number()
  .transform((value, context) =>
    normalize(value, context, (input) => normalizePlannedSeconds(input, "break")),
  );

export const focusExpectedVersionRequestSchema = z.strictObject({
  expectedVersion: focusVersionSchema,
});

export const focusHistoryQuerySchema = z.strictObject({
  cursor: focusOpaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(FOCUS_HISTORY_MAX_ITEMS).default(FOCUS_HISTORY_DEFAULT_ITEMS),
});

export type FocusHistoryQuery = z.input<typeof focusHistoryQuerySchema>;

export {
  FOCUS_BREAK_SECONDS_MAX,
  FOCUS_BREAK_SECONDS_MIN,
  FOCUS_CORRECTION_SECONDS_MAX,
  FOCUS_HISTORY_DEFAULT_ITEMS,
  FOCUS_HISTORY_MAX_ITEMS,
  FOCUS_PLANNED_SECONDS_MAX,
  FOCUS_PLANNED_SECONDS_MIN,
  FOCUS_PLANNED_SECONDS_STEP,
  FOCUS_RECORDED_SECONDS_MAX,
  FOCUS_SUMMARY_DAYS,
  FOCUS_VERSION_MAX,
} from "../../domain/focus-limits";

function assertAndReturn(value: number, assertion: (input: number) => void): number {
  assertion(value);
  return value;
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
