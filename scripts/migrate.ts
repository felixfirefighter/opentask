import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { parseEnvironment } from "../shared/config/environment.ts";
import { createLogger } from "../shared/logging/logger.ts";

const environment = parseEnvironment(process.env);
const logger = createLogger();
const pool = new Pool({
  connectionString: environment.DATABASE_URL,
  max: 1,
  application_name: "omplish-migrate",
});

try {
  await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), "drizzle") });
  logger.event("MIGRATIONS_APPLIED");
} catch (error) {
  logger.event("MIGRATIONS_FAILED", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
