import { z } from "zod";

import {
  pushCapabilitySchema,
  pushSubscriptionRegistrationResultSchema,
  pushSubscriptionRevocationResultSchema,
  registerPushSubscriptionInputSchema,
  removeTaskReminderRequestSchema,
  revokePushSubscriptionInputSchema,
  setTaskReminderRequestSchema,
  taskReminderDtoSchema,
  type RegisterPushSubscriptionInput,
  type RevokePushSubscriptionInput,
  type SetTaskReminderRequest,
} from "../../application/contracts";
import { notificationJsonMutation, requestNotificationJson } from "./notification-api-request";

const reminderRemovedSchema = z.strictObject({ removed: z.literal(true) });

export function getPushCapability() {
  return requestNotificationJson("/api/v1/notifications/capability", pushCapabilitySchema);
}

export function getTaskReminder(taskId: string) {
  return requestNotificationJson(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/reminder`,
    taskReminderDtoSchema.nullable(),
  );
}

export function setTaskReminder(taskId: string, input: SetTaskReminderRequest) {
  return requestNotificationJson(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/reminder`,
    taskReminderDtoSchema,
    notificationJsonMutation("PUT", setTaskReminderRequestSchema.parse(input)),
  );
}

export function removeTaskReminder(taskId: string, expectedVersion: number) {
  return requestNotificationJson(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/reminder`,
    reminderRemovedSchema,
    notificationJsonMutation("DELETE", removeTaskReminderRequestSchema.parse({ expectedVersion })),
  );
}

export function registerPushSubscription(input: RegisterPushSubscriptionInput) {
  return requestNotificationJson(
    "/api/v1/notifications/subscriptions",
    pushSubscriptionRegistrationResultSchema,
    notificationJsonMutation("POST", registerPushSubscriptionInputSchema.parse(input)),
  );
}

export function revokePushSubscription(input: RevokePushSubscriptionInput) {
  return requestNotificationJson(
    "/api/v1/notifications/subscriptions/revoke",
    pushSubscriptionRevocationResultSchema,
    notificationJsonMutation("POST", revokePushSubscriptionInputSchema.parse(input)),
  );
}
