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
  logger.info({ code: "SEED_COMPLETE", recordsWritten: 0 }, "bootstrap seed complete");
} finally {
  await pool.end();
}
