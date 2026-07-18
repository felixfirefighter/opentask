import { Pool } from "pg";

import { parseEnvironment } from "../shared/config/environment.ts";
import { createLogger } from "../shared/logging/logger.ts";

const environment = parseEnvironment(process.env);
const logger = createLogger();
const pool = new Pool({
  connectionString: environment.DATABASE_URL,
  max: 1,
  application_name: "opentask-seed",
});

try {
  await pool.query("select 1");
  logger.event("SEED_COMPLETE", { recordsWritten: 0 });
} catch (error) {
  logger.event("SEED_FAILED", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
