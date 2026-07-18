import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTestDatabaseUrl } from "../../shared/config/environment.ts";

const schemaName = `ot_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const adminPool = new Pool({
  connectionString: getTestDatabaseUrl(),
  max: 1,
  application_name: "opentask-db-test-admin",
});
let isolatedPool: Pool | undefined;

describe("database bootstrap", () => {
  beforeAll(async () => {
    await adminPool.query(`create schema "${schemaName}"`);
    isolatedPool = new Pool({
      connectionString: getTestDatabaseUrl(),
      max: 2,
      application_name: "opentask-db-test-isolated",
      options: `-c search_path=${schemaName}`,
    });

    await migrate(drizzle(isolatedPool), {
      migrationsFolder: "drizzle",
      migrationsSchema: schemaName,
    });
  });

  afterAll(async () => {
    await isolatedPool?.end();
    await adminPool.query(`drop schema if exists "${schemaName}" cascade`);
    await adminPool.end();
  });

  it("applies migrations and writes inside a per-run PostgreSQL schema", async () => {
    if (!isolatedPool) throw new Error("The isolated database pool was not initialized.");
    const client = await isolatedPool.connect();

    try {
      const searchPath = await client.query<{ search_path: string }>("show search_path");
      expect(searchPath.rows).toEqual([{ search_path: schemaName }]);

      const ledger = await client.query<{ schema_name: string }>(
        "select schemaname as schema_name from pg_tables where schemaname = current_schema() and tablename = '__drizzle_migrations'",
      );
      expect(ledger.rows).toEqual([{ schema_name: schemaName }]);

      await client.query("create table bootstrap_probe (id integer primary key)");
      await client.query("insert into bootstrap_probe (id) values (1)");
      const result = await client.query<{ id: number; schema_name: string }>(
        "select id, current_schema() as schema_name from bootstrap_probe",
      );

      expect(result.rows).toEqual([{ id: 1, schema_name: schemaName }]);
    } finally {
      client.release();
    }
  });
});
