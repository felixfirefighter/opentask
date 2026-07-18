import { PgBoss } from "pg-boss";

import { parseEnvironment } from "../shared/config/environment.ts";
import { createLogger } from "../shared/logging/logger.ts";

export const registeredJobs = [] as const;

export async function startWorker() {
  const environment = parseEnvironment(process.env);
  const logger = createLogger();
  const boss = new PgBoss(environment.DATABASE_URL);

  boss.on("error", (error) => {
    logger.error({ code: "WORKER_QUEUE_ERROR", errorName: error.name }, "worker queue error");
  });

  await boss.start();
  logger.info(
    { code: "WORKER_READY", registeredJobCount: registeredJobs.length },
    "worker started with registered jobs",
  );

  return {
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
      logger.info({ code: "WORKER_STOPPED" }, "worker stopped");
    },
  };
}
