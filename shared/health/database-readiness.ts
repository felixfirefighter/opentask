import { getDatabasePool } from "../db/client.ts";
import { readCommittedMigrationRevisions } from "../db/migration-files.ts";

export async function assertDatabaseReady() {
  const pool = getDatabasePool();
  const result = await pool.query<{ migrations_table: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as migrations_table",
  );

  if (!result.rows[0]?.migrations_table) {
    throw new Error("Database migrations have not been applied");
  }

  const expected = readCommittedMigrationRevisions().at(-1);
  const applied = await pool.query<{ created_at: string | null; hash: string }>(
    "select created_at::text, hash from drizzle.__drizzle_migrations order by created_at desc limit 1",
  );
  const latest = applied.rows[0];

  if (
    !expected ||
    !latest ||
    Number(latest.created_at) !== expected.folderMillis ||
    latest.hash !== expected.hash
  ) {
    throw new Error("Database migration revision does not match the application");
  }
}
