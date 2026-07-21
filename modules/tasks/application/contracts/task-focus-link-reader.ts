import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import {
  databaseSafeTextSchema,
  entityIdSchema,
  taskStatusSchema,
  taskTitleSchema,
} from "./contract-primitives";

export const taskFocusLinkDtoSchema = z.strictObject({
  id: entityIdSchema,
  title: taskTitleSchema,
  status: taskStatusSchema,
  available: z.boolean(),
});

export const taskFocusLinkIdSelectionSchema = z
  .array(entityIdSchema)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "Focus-link task IDs must be unique.");

export const taskFocusLinkSearchInputSchema = z.strictObject({
  q: databaseSafeTextSchema
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 120, {
      message: "Focus-link search must contain at most 120 Unicode characters.",
    }),
  limit: z.number().int().min(1).max(20),
});

export type TaskFocusLinkDto = z.infer<typeof taskFocusLinkDtoSchema>;
export type TaskFocusLinkSearchInput = z.input<typeof taskFocusLinkSearchInputSchema>;

export interface TaskFocusLinkReader {
  readOwned(
    actor: AuthenticatedActor,
    taskId: string,
    executor?: DatabaseExecutor,
  ): Promise<TaskFocusLinkDto | null>;
  readOwnedMany(
    actor: AuthenticatedActor,
    taskIds: readonly string[],
    executor?: DatabaseExecutor,
  ): Promise<readonly TaskFocusLinkDto[]>;
  searchOwned(
    actor: AuthenticatedActor,
    input: TaskFocusLinkSearchInput,
  ): Promise<readonly TaskFocusLinkDto[]>;
}
