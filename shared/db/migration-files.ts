import { resolve } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";

export function readCommittedMigrationRevisions() {
  return readMigrationFiles({ migrationsFolder: resolve(process.cwd(), "drizzle") });
}
