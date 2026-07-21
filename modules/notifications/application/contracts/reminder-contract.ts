import { z } from "zod";

import {
  notificationIdSchema,
  notificationInstantSchema,
  notificationOffsetMinutesSchema,
  notificationVersionSchema,
} from "./notification-primitives";

export const absoluteReminderSpecSchema = z.strictObject({
  kind: z.literal("absolute"),
  remindAt: notificationInstantSchema,
  offsetMinutes: z.null().optional().default(null),
});

export const relativeStartReminderSpecSchema = z.strictObject({
  kind: z.literal("relative_start"),
  remindAt: z.null().optional().default(null),
  offsetMinutes: notificationOffsetMinutesSchema,
});

export const taskReminderSpecSchema = z.discriminatedUnion("kind", [
  absoluteReminderSpecSchema,
  relativeStartReminderSpecSchema,
]);

export const setTaskReminderInputSchema = z.strictObject({
  id: notificationIdSchema,
  taskId: notificationIdSchema,
  expectedVersion: notificationVersionSchema.nullable(),
  enabled: z.boolean(),
  spec: taskReminderSpecSchema,
});

export const setTaskReminderRequestSchema = setTaskReminderInputSchema.omit({ taskId: true });

export const removeTaskReminderInputSchema = z.strictObject({
  taskId: notificationIdSchema,
  expectedVersion: notificationVersionSchema,
});

export const removeTaskReminderRequestSchema = removeTaskReminderInputSchema.omit({ taskId: true });

export const taskReminderDtoSchema = z.strictObject({
  id: notificationIdSchema,
  taskId: notificationIdSchema,
  enabled: z.boolean(),
  version: notificationVersionSchema,
  spec: taskReminderSpecSchema,
  createdAt: notificationInstantSchema,
  updatedAt: notificationInstantSchema,
});

export type AbsoluteReminderSpec = z.infer<typeof absoluteReminderSpecSchema>;
export type RelativeStartReminderSpec = z.infer<typeof relativeStartReminderSpecSchema>;
export type RemoveTaskReminderInput = z.infer<typeof removeTaskReminderInputSchema>;
export type RemoveTaskReminderRequest = z.infer<typeof removeTaskReminderRequestSchema>;
export type SetTaskReminderInput = z.infer<typeof setTaskReminderInputSchema>;
export type SetTaskReminderRequest = z.infer<typeof setTaskReminderRequestSchema>;
export type TaskReminderDto = z.infer<typeof taskReminderDtoSchema>;
export type TaskReminderSpec = z.infer<typeof taskReminderSpecSchema>;
