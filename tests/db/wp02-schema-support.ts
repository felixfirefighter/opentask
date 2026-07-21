import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";

import { getTestDatabaseUrl } from "../../shared/config/environment.ts";
import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

export function createWp02SchemaFixture(suiteName: string) {
  const schemaName = `wp02_${suiteName}_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const adminPool = new Pool({
    connectionString: getTestDatabaseUrl(),
    max: 1,
    application_name: `omplish-wp02-${suiteName}-admin`,
  });
  let isolatedPool: Pool | undefined;

  return {
    schemaName,

    async setup({ migrateLatest = true }: { migrateLatest?: boolean } = {}) {
      await adminPool.query(`create schema "${schemaName}"`);
      isolatedPool = new Pool({
        connectionString: getTestDatabaseUrl(),
        max: 4,
        application_name: `omplish-wp02-${suiteName}-isolated`,
        options: `-c search_path=${schemaName}`,
      });
      if (migrateLatest) {
        await migrate(drizzle(isolatedPool), {
          migrationsFolder: "drizzle",
          migrationsSchema: schemaName,
        });
      }
      return isolatedPool;
    },

    async teardown() {
      await isolatedPool?.end();
      await adminPool.query(`drop schema if exists "${schemaName}" cascade`);
      await adminPool.end();
    },
  };
}

export async function applyMigrationSlice(pool: Pool, startInclusive: number, endExclusive: number) {
  const revisions = readCommittedMigrationRevisions().slice(startInclusive, endExclusive);
  const client = await pool.connect();
  try {
    for (const revision of revisions) await applyRevision(client, revision.sql);
  } finally {
    client.release();
  }
}

async function applyRevision(client: PoolClient, statements: readonly string[]) {
  await client.query("begin");
  try {
    for (const statement of statements) {
      if (statement.trim()) await client.query(statement);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function insertUser(pool: Pool, label: string) {
  const id = randomUUID();
  await pool.query(`insert into "user" (id, name, email, email_verified) values ($1, $2, $3, false)`, [
    id,
    label,
    `${label}-${id}@example.test`,
  ]);
  return id;
}

export async function expectPostgresError(work: Promise<unknown>, code: string) {
  try {
    await work;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === code) return;
    throw error;
  }
  throw new Error(`Expected PostgreSQL error ${code}.`);
}
