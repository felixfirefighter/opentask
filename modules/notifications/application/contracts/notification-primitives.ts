import { z } from "zod";

import {
  NOTIFICATION_ATTEMPT_MAX,
  NOTIFICATION_ERROR_CODES,
  REMINDER_OFFSET_MINUTES_MAX,
  REMINDER_OFFSET_MINUTES_MIN,
} from "../../domain/notification-limits";

export const notificationIdSchema = z.uuidv4().transform((value) => value.toLowerCase());
export const notificationVersionSchema = z.number().int().positive().max(2_147_483_647);
export const notificationInstantSchema = z.iso.datetime({ offset: true });
export const notificationOffsetMinutesSchema = z
  .number()
  .int()
  .min(REMINDER_OFFSET_MINUTES_MIN)
  .max(REMINDER_OFFSET_MINUTES_MAX);
export const notificationOccurrenceKeySchema = z.string().min(1).max(80);
export const notificationAttemptCountSchema = z.number().int().min(0).max(NOTIFICATION_ATTEMPT_MAX);
export const notificationErrorCodeSchema = z.enum(NOTIFICATION_ERROR_CODES);
export const deliveryIdempotencyKeySchema = z.string().regex(/^[0-9a-f]{64}$/);
