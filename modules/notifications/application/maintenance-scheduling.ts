import type { DatabaseExecutor } from "@/shared/db/client";

import type { NotificationMaintenanceJob } from "./contracts";
import type { NotificationJobScheduler } from "./notification-ports";
import { NOTIFICATION_CLEANUP_AFTER_SECONDS } from "../domain/notification-limits";

export function addNotificationSeconds(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1_000);
}

export function notificationCleanupAt(now: Date): Date {
  return addNotificationSeconds(now, NOTIFICATION_CLEANUP_AFTER_SECONDS);
}

export const notificationCleanupEligibleAt = notificationCleanupAt;

export async function scheduleActorRecovery(
  scheduler: NotificationJobScheduler,
  userId: string,
  now: Date,
  executor: DatabaseExecutor,
): Promise<void> {
  await scheduler.sendMaintenance(
    { schemaVersion: 1, userId, kind: "actor_recovery", after: null },
    {
      startAfter: now,
      dedupeKey: `notification-actor-recovery:${userId}:${Math.floor(now.getTime() / 60_000)}`,
    },
    executor,
  );
}

export async function scheduleTargetMaintenance(
  scheduler: NotificationJobScheduler,
  job: Exclude<NotificationMaintenanceJob, { kind: "actor_recovery" }>,
  startAfter: Date,
  executor: DatabaseExecutor,
): Promise<void> {
  const target =
    "deliveryId" in job ? job.deliveryId : "subscriptionId" in job ? job.subscriptionId : job.reminderId;
  await scheduler.sendMaintenance(
    job,
    {
      startAfter,
      dedupeKey: `notification-${job.kind}:${job.userId}:${target}:${startAfter.toISOString()}`,
    },
    executor,
  );
}
