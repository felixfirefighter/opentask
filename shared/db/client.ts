import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnvironment } from "../config/environment.ts";
import { logger } from "../logging/logger.ts";

import { schema } from "./schema.ts";

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnvironment().DATABASE_URL,
      max: 10,
      application_name: "opentask-web",
    });
    pool.on("error", (error) => {
      logger.event("DATABASE_POOL_ERROR", { errorName: error.name });
    });
  }

  return pool;
}

export function getDatabase() {
  return drizzle(getDatabasePool(), { schema });
}

export async function closeDatabasePool() {
  const currentPool = pool;
  pool = undefined;
  await currentPool?.end();
}
