import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTestDatabaseUrl } from "../../shared/config/environment.ts";

const schemaName = `opentask_test_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({
  connectionString: getTestDatabaseUrl(),
  max: 2,
  application_name: "opentask-db-test",
});

describe("database bootstrap", () => {
  beforeAll(async () => {
    await migrate(drizzle(pool), {
      migrationsFolder: "drizzle",
      migrationsSchema: `${schemaName}_migrations`,
    });
    await pool.query(`create schema "${schemaName}"`);
  });

  afterAll(async () => {
    await pool.query(`drop schema if exists "${schemaName}" cascade`);
    await pool.query(`drop schema if exists "${schemaName}_migrations" cascade`);
    await pool.end();
  });

  it("isolates writes inside a per-run PostgreSQL schema", async () => {
    const client = await pool.connect();

    try {
      await client.query(`set search_path to "${schemaName}"`);
      await client.query("create table bootstrap_probe (id integer primary key)");
      await client.query("insert into bootstrap_probe (id) values (1)");
      const result = await client.query<{ id: number }>("select id from bootstrap_probe");

      expect(result.rows).toEqual([{ id: 1 }]);
    } finally {
      client.release();
    }
  });
});
