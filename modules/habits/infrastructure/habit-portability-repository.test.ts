import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";

import { createHabitPortabilityRepository } from "./habit-portability-repository";

const userId = "11111111-1111-4111-8111-111111111111";

describe("habit portability repository SQL", () => {
  it("reads each portable table sequentially and scopes every query by actor", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const callback: RemoteCallback = async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    };
    const executor = createProxyDatabase(callback) as unknown as DatabaseExecutor;

    await createHabitPortabilityRepository(executor).readOwned(userId);

    expect(queries).toHaveLength(3);
    expect(queries.map(({ sql }) => sql)).toEqual([
      expect.stringContaining('from "habits"'),
      expect.stringContaining('from "habit_schedules"'),
      expect.stringContaining('from "habit_logs"'),
    ]);
    for (const query of queries) {
      expect(query.sql).toContain('"user_id" =');
      expect(query.params).toContain(userId);
    }
  });
});
