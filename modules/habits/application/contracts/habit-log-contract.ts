import { z } from "zod";

import {
  habitIdSchema,
  habitInstantSchema,
  habitLocalDateSchema,
  habitNoteSchema,
  habitQuantitySchema,
  habitVersionSchema,
} from "./habit-contract-primitives";

export const habitLogStateSchema = z.enum(["completed", "skipped", "unachieved"]);

export const habitLogValueSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("completed"),
    quantity: habitQuantitySchema.nullable().optional().default(null),
    note: habitNoteSchema.nullable().optional().default(null),
  }),
  z.strictObject({
    state: z.literal("skipped"),
    quantity: z.null().optional().default(null),
    note: habitNoteSchema.nullable().optional().default(null),
  }),
  z.strictObject({
    state: z.literal("unachieved"),
    quantity: z.null().optional().default(null),
    note: habitNoteSchema.nullable().optional().default(null),
  }),
]);

export const habitLogDtoSchema = z.strictObject({
  id: habitIdSchema,
  habitId: habitIdSchema,
  localDate: habitLocalDateSchema,
  state: habitLogStateSchema,
  quantity: habitQuantitySchema.nullable(),
  note: habitNoteSchema.nullable(),
  successful: z.boolean(),
  version: habitVersionSchema,
  createdAt: habitInstantSchema,
  updatedAt: habitInstantSchema,
});

export const recordHabitDayRequestSchema = z.strictObject({
  localDate: habitLocalDateSchema,
  value: habitLogValueSchema,
});

export const editHabitDayRequestSchema = z.strictObject({
  expectedVersion: habitVersionSchema,
  value: habitLogValueSchema,
});

export const undoHabitDayRequestSchema = z.strictObject({ expectedVersion: habitVersionSchema });

export const recordHabitDayResultSchema = z.strictObject({
  outcome: z.enum(["created", "idempotent_retry"]),
  log: habitLogDtoSchema,
});

export type EditHabitDayRequest = z.infer<typeof editHabitDayRequestSchema>;
export type HabitLogDto = z.infer<typeof habitLogDtoSchema>;
export type HabitLogValue = z.infer<typeof habitLogValueSchema>;
export type RecordHabitDayRequest = z.infer<typeof recordHabitDayRequestSchema>;
export type RecordHabitDayResult = z.infer<typeof recordHabitDayResultSchema>;
export type UndoHabitDayRequest = z.infer<typeof undoHabitDayRequestSchema>;
