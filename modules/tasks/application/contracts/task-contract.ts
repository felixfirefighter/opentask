import { z } from "zod";

import { checklistItemDtoSchema } from "./checklist-contract";
import {
  databaseSafeTextSchema,
  entityIdSchema,
  expectedVersionRequestSchema,
  isoTimestampSchema,
  opaqueCursorSchema,
  organizerNameSchema,
  placementSchema,
  serverRankSchema,
  softDeletableResourceSchema,
  taskDescriptionSchema,
  taskPrioritySchema,
  taskStatusSchema,
  taskTitleSchema,
  versionSchema,
  versionedResourceReferenceSchema,
} from "./contract-primitives";
import { tagDtoSchema } from "./tag-contract";

export const taskDtoSchema = softDeletableResourceSchema.extend({
  listId: entityIdSchema,
  sectionId: entityIdSchema.nullable(),
  parentTaskId: entityIdSchema.nullable(),
  title: taskTitleSchema,
  descriptionMd: taskDescriptionSchema,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  rank: serverRankSchema,
  statusChangedAt: isoTimestampSchema,
});

export const taskVersionRefSchema = versionedResourceReferenceSchema;

export const taskDetailDtoSchema = taskDtoSchema.extend({
  checklistItems: z.array(checklistItemDtoSchema),
  tags: z.array(tagDtoSchema),
  subtasks: z.array(taskDtoSchema),
});

export const taskListItemDtoSchema = taskDtoSchema.extend({
  tags: z.array(tagDtoSchema),
});

export const taskPageSchema = z.strictObject({
  items: z.array(taskListItemDtoSchema),
  nextCursor: opaqueCursorSchema.nullable(),
});

export const taskQuerySchema = z.strictObject({
  listId: entityIdSchema,
  sectionId: entityIdSchema.optional(),
  parentTaskId: entityIdSchema.nullable().optional().default(null),
  status: taskStatusSchema.default("open"),
  cursor: opaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const terminalTaskQuerySchema = z.strictObject({
  status: z.enum(["completed", "cancelled"]),
  cursor: opaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createTaskRequestSchema = z.strictObject({
  title: taskTitleSchema,
  descriptionMd: taskDescriptionSchema.optional().default(""),
  priority: taskPrioritySchema.optional().default("none"),
  listId: entityIdSchema,
  sectionId: entityIdSchema.nullable().optional().default(null),
  parentTaskId: entityIdSchema.nullable().optional().default(null),
  placement: placementSchema.optional().default({ kind: "end" }),
});

const taskPatchSchema = z
  .strictObject({
    title: taskTitleSchema.optional(),
    descriptionMd: taskDescriptionSchema.optional(),
    priority: taskPrioritySchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "At least one task field must change.");

export const updateTaskRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  patch: taskPatchSchema,
});

export const transitionTaskStatusRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  status: taskStatusSchema,
});

export const moveTaskRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  listId: entityIdSchema,
  sectionId: entityIdSchema.nullable(),
  parentTaskId: entityIdSchema.nullable(),
  placement: placementSchema,
});

export const positionTaskRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  placement: placementSchema,
});

export const deleteTaskRequestSchema = expectedVersionRequestSchema;
export const restoreTaskRequestSchema = expectedVersionRequestSchema;

export const taskSearchQuerySchema = z.strictObject({
  q: databaseSafeTextSchema
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 120, "Search text is too long."),
  cursor: opaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const taskSearchResultDtoSchema = z.strictObject({
  task: taskDtoSchema,
  list: z.strictObject({ id: entityIdSchema, name: organizerNameSchema }),
  matchedFields: z
    .array(z.enum(["title", "description", "tag"]))
    .min(1)
    .max(3)
    .refine((fields) => new Set(fields).size === fields.length, "Matched fields must be unique."),
  matchingTags: z.array(tagDtoSchema),
});

export const taskSearchPageSchema = z.strictObject({
  items: z.array(taskSearchResultDtoSchema),
  nextCursor: opaqueCursorSchema.nullable(),
});

export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type MoveTaskRequest = z.infer<typeof moveTaskRequestSchema>;
export type PositionTaskRequest = z.infer<typeof positionTaskRequestSchema>;
export type TaskDetailDto = z.infer<typeof taskDetailDtoSchema>;
export type TaskDto = z.infer<typeof taskDtoSchema>;
export type TaskListItemDto = z.infer<typeof taskListItemDtoSchema>;
export type TaskPage = z.infer<typeof taskPageSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
export type TaskSearchPage = z.infer<typeof taskSearchPageSchema>;
export type TaskSearchQuery = z.infer<typeof taskSearchQuerySchema>;
export type TaskSearchResultDto = z.infer<typeof taskSearchResultDtoSchema>;
export type TerminalTaskQuery = z.infer<typeof terminalTaskQuerySchema>;
export type TaskVersionRef = z.infer<typeof taskVersionRefSchema>;
export type TransitionTaskStatusRequest = z.infer<typeof transitionTaskStatusRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
