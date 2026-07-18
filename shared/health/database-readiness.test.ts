import { beforeEach, describe, expect, it, vi } from "vitest";

import { readCommittedMigrationRevisions } from "../db/migration-files";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../db/client.ts", () => ({
  getDatabasePool: () => ({ query }),
}));

import { assertDatabaseReady } from "./database-readiness";

describe("database readiness", () => {
  const expected = readCommittedMigrationRevisions().at(-1);

  beforeEach(() => query.mockReset());

  it("rejects a database without the migration ledger", async () => {
    query.mockResolvedValueOnce({ rows: [{ migrations_table: null }] });

    await expect(assertDatabaseReady()).rejects.toThrow("migrations have not been applied");
  });

  it("rejects a database at a different migration revision", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ migrations_table: "drizzle.__drizzle_migrations" }] })
      .mockResolvedValueOnce({ rows: [{ created_at: "1", hash: "different" }] });

    await expect(assertDatabaseReady()).rejects.toThrow("revision does not match");
  });

  it("accepts the exact committed migration revision", async () => {
    expect(expected).toBeDefined();
    query
      .mockResolvedValueOnce({ rows: [{ migrations_table: "drizzle.__drizzle_migrations" }] })
      .mockResolvedValueOnce({
        rows: [{ created_at: String(expected?.folderMillis), hash: expected?.hash }],
      });

    await expect(assertDatabaseReady()).resolves.toBeUndefined();
  });
});
