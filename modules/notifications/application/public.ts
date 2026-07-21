import type { TaskReminderSourceReader } from "@/modules/tasks";
import { getDatabase } from "@/shared/db/client";
import { createEntityId } from "@/shared/db/ids";
import { systemClock } from "@/shared/time/clock";

import { createNotificationApplication } from "./notification-application";
import { notificationDeliveryJobSchema, notificationMaintenanceJobSchema } from "./contracts";
import { createAesSubscriptionCipher } from "../infrastructure/aes-subscription-cipher";
import { createNodeNotificationDigest } from "../infrastructure/node-notification-digest";
import { getNotificationConfiguration } from "../infrastructure/notification-configuration";
import { createNotificationDeliveryRepository } from "../infrastructure/notification-delivery-repository";
import { createNotificationRuntimeConfiguration } from "../infrastructure/notification-runtime-configuration";
import { getProductionNotificationJobScheduler } from "../infrastructure/pg-boss-notification-scheduler";
import { createPushSubscriptionRepository } from "../infrastructure/push-subscription-repository";
import { createTaskReminderRepository } from "../infrastructure/task-reminder-repository";
import { createWebPushProvider } from "../infrastructure/web-push-provider";
import { createProductionNotificationWorkerRuntime as createNotificationWorkerRuntime } from "../infrastructure/pg-boss-notification-worker";
import type { NotificationWorkerHandlers, NotificationWorkerRuntime } from "./notification-worker-contract";

export type { NotificationWorkerHandlers, NotificationWorkerRuntime } from "./notification-worker-contract";

let notificationApplication: ReturnType<typeof createNotificationApplication> | undefined;
let notificationWorkerRuntime: NotificationWorkerRuntime | undefined;

export function getProductionNotificationWorkerRuntime(
  input: Readonly<{ taskSourceReader: TaskReminderSourceReader }>,
) {
  notificationWorkerRuntime ??= createNotificationWorkerRuntime((scheduler) => {
    const application = createConfiguredNotificationApplication(
      input.taskSourceReader,
      scheduler,
      getNotificationConfiguration(),
    );
    return {
      deliverNotification: (job) => application.deliverNotification(notificationDeliveryJobSchema.parse(job)),
      runNotificationMaintenance: (job) =>
        application.runNotificationMaintenance(notificationMaintenanceJobSchema.parse(job)),
    } satisfies NotificationWorkerHandlers;
  });
  return notificationWorkerRuntime;
}

export function getProductionNotificationApplication(
  input: Readonly<{
    taskSourceReader: TaskReminderSourceReader;
  }>,
) {
  const configuration = getNotificationConfiguration();
  notificationApplication ??= createConfiguredNotificationApplication(
    input.taskSourceReader,
    getProductionNotificationJobScheduler(),
    configuration,
  );
  return notificationApplication;
}

function createConfiguredNotificationApplication(
  taskSourceReader: TaskReminderSourceReader,
  scheduler: Parameters<typeof createNotificationApplication>[0]["scheduler"],
  configuration: ReturnType<typeof getNotificationConfiguration>,
) {
  return createNotificationApplication({
    database: getDatabase(),
    clock: systemClock,
    tasks: taskSourceReader,
    reminders: createTaskReminderRepository(),
    subscriptions: createPushSubscriptionRepository(),
    deliveries: createNotificationDeliveryRepository(),
    cipher: createAesSubscriptionCipher(configuration.subscriptionEncryption),
    digest: createNodeNotificationDigest(),
    scheduler,
    provider: createWebPushProvider(configuration.vapid),
    runtime: createNotificationRuntimeConfiguration(configuration),
    ids: { next: createEntityId },
  });
}
