import { checkWorker, startWorker } from "./runtime.ts";
import { createLogger } from "../shared/logging/logger.ts";

try {
  await runWorker();
} catch (error) {
  createLogger().event("WORKER_START_FAILED", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
}

async function runWorker() {
  const checkOnly = process.argv.includes("--check");

  if (checkOnly) {
    await checkWorker();
  } else {
    const worker = await startWorker();
    await new Promise<void>((resolve, reject) => {
      let stopping = false;

      const stop = () => {
        if (stopping) return;
        stopping = true;
        void worker.stop().then(resolve, reject);
      };

      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  }
}
