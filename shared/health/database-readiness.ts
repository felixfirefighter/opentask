import { getDatabasePool } from "../db/client.ts";

export async function assertDatabaseReady() {
  const result = await getDatabasePool().query<{ migrations_table: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as migrations_table",
  );

  if (!result.rows[0]?.migrations_table) {
    throw new Error("Database migrations have not been applied");
  }
}
