import { z } from "zod";

import {
  habitColorTokenSchema,
  habitExpectedVersionSchema,
  HABIT_PAGE_MAX_ITEMS,
  habitIconSchema,
  habitIdSchema,
  habitInstantSchema,
  habitOpaqueCursorSchema,
  habitPageQuerySchema,
  habitTargetValueSchema,
  habitTitleSchema,
  habitUnitSchema,
  habitVersionSchema,
} from "./habit-contract-primitives";
import { habitScheduleDtoSchema, habitScheduleValueSchema } from "./habit-schedule-contract";

export const habitGoalSchema = z.discriminatedUnion("goalKind", [
  z.strictObject({
    goalKind: z.literal("boolean"),
    targetValue: z.null().optional().default(null),
    unit: z.null().optional().default(null),
  }),
  z.strictObject({
    goalKind: z.literal("quantity"),
    targetValue: habitTargetValueSchema,
    unit: habitUnitSchema,
  }),
]);

export const habitDtoSchema = z.strictObject({
  id: habitIdSchema,
  title: habitTitleSchema,
  icon: habitIconSchema,
  colorToken: habitColorTokenSchema,
  goal: habitGoalSchema,
  version: habitVersionSchema,
  createdAt: habitInstantSchema,
  updatedAt: habitInstantSchema,
  archivedAt: habitInstantSchema.nullable(),
});

export const habitDetailDtoSchema = z.strictObject({
  habit: habitDtoSchema,
  schedule: habitScheduleDtoSchema,
});

export const createHabitRequestSchema = z.strictObject({
  title: habitTitleSchema,
  icon: habitIconSchema,
  colorToken: habitColorTokenSchema,
  goal: habitGoalSchema,
  schedule: habitScheduleValueSchema,
});

const habitDefinitionPatchSchema = z
  .strictObject({
    title: habitTitleSchema.optional(),
    icon: habitIconSchema.optional(),
    colorToken: habitColorTokenSchema.optional(),
    goal: habitGoalSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "At least one habit field must change.");

export const updateHabitRequestSchema = z.strictObject({
  expectedVersion: habitVersionSchema,
  patch: habitDefinitionPatchSchema,
});

export const habitLifecycleRequestSchema = habitExpectedVersionSchema;
export const habitLifecyclePageQuerySchema = habitPageQuerySchema.extend({
  lifecycle: z.enum(["active", "archived"]).default("active"),
});
export const habitDefinitionPageSchema = z.strictObject({
  items: z.array(habitDetailDtoSchema).max(HABIT_PAGE_MAX_ITEMS),
  nextCursor: habitOpaqueCursorSchema.nullable(),
});

export type CreateHabitRequest = z.infer<typeof createHabitRequestSchema>;
export type HabitDetailDto = z.infer<typeof habitDetailDtoSchema>;
export type HabitDefinitionPage = z.infer<typeof habitDefinitionPageSchema>;
export type HabitDto = z.infer<typeof habitDtoSchema>;
export type HabitGoal = z.infer<typeof habitGoalSchema>;
export type HabitLifecyclePageQuery = z.input<typeof habitLifecyclePageQuerySchema>;
export type UpdateHabitRequest = z.infer<typeof updateHabitRequestSchema>;
