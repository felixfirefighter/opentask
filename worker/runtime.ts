import {
  getProductionNotificationWorkerRuntime,
  type NotificationWorkerRuntime,
} from "../modules/notifications/index.ts";
import { getTasksApplication } from "../modules/tasks/index.ts";
import { createLogger, type SafeLogger } from "../shared/logging/logger.ts";

export async function checkWorker(
  runtime: NotificationWorkerRuntime = createReleaseWorkerRuntime(),
  log: SafeLogger = createLogger(),
): Promise<void> {
  await runtime.check();
  log.event("WORKER_CHECK_OK", { declaredJobCount: runtime.declaredJobCount });
}

export async function startWorker(
  runtime: NotificationWorkerRuntime = createReleaseWorkerRuntime(),
  log: SafeLogger = createLogger(),
) {
  const active = await runtime.start();
  let stopped = false;
  log.event("WORKER_READY", { registeredJobCount: runtime.declaredJobCount });

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      await active.stop();
      log.event("WORKER_STOPPED");
    },
  };
}

function createReleaseWorkerRuntime(): NotificationWorkerRuntime {
  const tasks = getTasksApplication();
  return getProductionNotificationWorkerRuntime({
    taskSourceReader: tasks.reminderSources,
  });
}
