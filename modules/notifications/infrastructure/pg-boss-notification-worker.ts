import { sql } from "drizzle-orm";
import { PgBoss, type Job } from "pg-boss";

import { getEnvironment } from "@/shared/config/environment";
import { closeDatabasePool, getDatabase } from "@/shared/db/client";
import { notificationDeliveries, pushSubscriptions, taskReminders } from "@/shared/db/schema";
import { logger } from "@/shared/logging/logger";

import {
  createPgBossNotificationJobScheduler,
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_DELIVERY_WORK_OPTIONS,
  NOTIFICATION_MAINTENANCE_QUEUE,
  NOTIFICATION_MAINTENANCE_WORK_OPTIONS,
  type NotificationJobSchedulerAdapter,
} from "./pg-boss-notification-scheduler";
import { getNotificationConfiguration } from "./notification-configuration";

type NotificationWorkerBoss = Pick<PgBoss, "createQueue" | "getQueue" | "send" | "start" | "stop" | "work">;

export function createProductionNotificationWorkerRuntime(
  createHandlers: (scheduler: NotificationJobSchedulerAdapter) => InfrastructureWorkerHandlers,
) {
  const workerEnabled = getNotificationConfiguration().workerMode === "enabled";
  const boss = new PgBoss({
    connectionString: getEnvironment().DATABASE_URL,
    application_name: "opentask-notification-worker",
  });
  boss.on("error", (error) => {
    logger.event("WORKER_QUEUE_ERROR", { errorName: error.name });
  });
  const scheduler = createPgBossNotificationJobScheduler(boss);
  return createNotificationWorkerRuntime(
    boss,
    createHandlers(scheduler),
    validateNotificationSchema,
    workerEnabled,
    closeDatabasePool,
  );
}

export function createNotificationWorkerRuntime(
  boss: NotificationWorkerBoss,
  handlers: InfrastructureWorkerHandlers,
  validateSchema: () => Promise<void> = async () => undefined,
  workerEnabled = true,
  cleanup: () => Promise<void> = async () => undefined,
): InfrastructureWorkerRuntime {
  const scheduler = createPgBossNotificationJobScheduler(boss);

  return {
    declaredJobCount: 2 as const,

    async check() {
      await boss.start();
      try {
        await validateSchema();
        await scheduler.ensureQueues();
      } finally {
        try {
          await boss.stop({ graceful: true, timeout: 15_000 });
        } finally {
          await cleanup();
        }
      }
    },

    async start() {
      if (!workerEnabled) throw new NotificationWorkerModeError();
      await boss.start();
      let stopped = false;
      try {
        await validateSchema();
        await scheduler.ensureQueues();
        await boss.work(
          NOTIFICATION_DELIVERY_QUEUE,
          NOTIFICATION_DELIVERY_WORK_OPTIONS,
          async (jobs: Job<unknown>[]) => {
            for (const job of jobs) {
              const result = await handlers.deliverNotification(job.data);
              if (result.outcome === "retry") throw new NotificationDeliveryRetryError();
            }
          },
        );
        await boss.work(
          NOTIFICATION_MAINTENANCE_QUEUE,
          NOTIFICATION_MAINTENANCE_WORK_OPTIONS,
          async (jobs: Job<unknown>[]) => {
            for (const job of jobs) {
              await handlers.runNotificationMaintenance(job.data);
            }
          },
        );
      } catch (error) {
        try {
          await boss.stop({ graceful: true, timeout: 15_000 });
        } finally {
          await cleanup();
        }
        throw error;
      }

      return {
        async stop() {
          if (stopped) return;
          stopped = true;
          try {
            await boss.stop({ graceful: true, timeout: 15_000 });
          } finally {
            await cleanup();
          }
        },
      };
    },
  };
}

type InfrastructureWorkerHandlers = Readonly<{
  deliverNotification(job: unknown): Promise<Readonly<{ outcome: "completed" | "noop" | "retry" }>>;
  runNotificationMaintenance(job: unknown): Promise<void>;
}>;

type InfrastructureWorkerRuntime = Readonly<{
  declaredJobCount: 2;
  check(): Promise<void>;
  start(): Promise<Readonly<{ stop(): Promise<void> }>>;
}>;

export class NotificationWorkerModeError extends Error {
  constructor() {
    super("The notification worker starts only when REMINDER_WORKER_MODE=enabled.");
    this.name = "NotificationWorkerModeError";
  }
}

export class NotificationDeliveryRetryError extends Error {
  constructor() {
    super("Notification delivery received an explicit retryable provider response.");
    this.name = "NotificationDeliveryRetryError";
  }
}

async function validateNotificationSchema(): Promise<void> {
  await getDatabase().execute(sql`
    select 1
    from ${taskReminders}
    left join ${pushSubscriptions} on false
    left join ${notificationDeliveries} on false
    limit 0
  `);
}
