import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { habitIdSchema, habitTitleSchema } from "./habit-contract-primitives";
import { isDatabaseSafeHabitText } from "../../domain/habit-text";

export const habitFocusLinkDtoSchema = z.strictObject({
  id: habitIdSchema,
  title: habitTitleSchema,
  available: z.boolean(),
});

export const habitFocusLinkIdSelectionSchema = z
  .array(habitIdSchema)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "Focus-link habit IDs must be unique.");

export const habitFocusLinkSearchInputSchema = z.strictObject({
  q: z
    .string()
    .trim()
    .min(1)
    .refine(isDatabaseSafeHabitText, {
      message: "Focus-link search contains a character that cannot be stored safely.",
    })
    .refine((value) => Array.from(value).length <= 120, {
      message: "Focus-link search must contain at most 120 Unicode characters.",
    }),
  limit: z.number().int().min(1).max(20),
});

export type HabitFocusLinkDto = z.infer<typeof habitFocusLinkDtoSchema>;
export type HabitFocusLinkSearchInput = z.input<typeof habitFocusLinkSearchInputSchema>;

export interface HabitFocusLinkReader {
  readOwned(
    actor: AuthenticatedActor,
    habitId: string,
    executor?: DatabaseExecutor,
  ): Promise<HabitFocusLinkDto | null>;
  readOwnedMany(
    actor: AuthenticatedActor,
    habitIds: readonly string[],
    executor?: DatabaseExecutor,
  ): Promise<readonly HabitFocusLinkDto[]>;
  searchOwned(
    actor: AuthenticatedActor,
    input: HabitFocusLinkSearchInput,
  ): Promise<readonly HabitFocusLinkDto[]>;
}
