import type { NotificationDeliveryJob, NotificationMaintenanceJob } from "./contracts";
import type { DeliverNotificationResult } from "./delivery-settlement";

export const notificationWorkerDeclaredJobCount = 2 as const;

export type NotificationWorkerHandlers = Readonly<{
  deliverNotification(job: NotificationDeliveryJob): Promise<DeliverNotificationResult>;
  runNotificationMaintenance(job: NotificationMaintenanceJob): Promise<void>;
}>;

export type NotificationWorkerRuntime = Readonly<{
  declaredJobCount: typeof notificationWorkerDeclaredJobCount;
  check(): Promise<void>;
  start(): Promise<Readonly<{ stop(): Promise<void> }>>;
}>;
