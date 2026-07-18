import { PgBoss } from "pg-boss";

import { parseEnvironment } from "../shared/config/environment.ts";
import { createLogger } from "../shared/logging/logger.ts";

export const registeredJobs = [] as const;

export async function startWorker() {
  const environment = parseEnvironment(process.env);
  const logger = createLogger();
  const boss = new PgBoss(environment.DATABASE_URL);

  boss.on("error", (error) => {
    logger.event("WORKER_QUEUE_ERROR", { errorName: error.name });
  });

  await boss.start();
  logger.event("WORKER_READY", { registeredJobCount: registeredJobs.length });

  return {
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
      logger.event("WORKER_STOPPED");
    },
  };
}
