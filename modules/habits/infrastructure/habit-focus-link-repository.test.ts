import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createHabitFocusLinkRepository } from "./habit-focus-link-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const firstHabitId = "22222222-2222-4222-8222-222222222222";
const secondHabitId = "33333333-3333-4333-8333-333333333333";

type CapturedQuery = Readonly<{ sql: string; params: unknown[] }>;

function createRecorder() {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [] };
  };
  return {
    queries,
    executor: createProxyDatabase(callback, { schema }) as unknown as DatabaseExecutor,
  };
}

describe("habit focus-link repository SQL", () => {
  it("scopes single and one-query batch hydration by actor without hiding archived history", async () => {
    const recorder = createRecorder();
    const repository = createHabitFocusLinkRepository(recorder.executor);

    await repository.readOwned(userId, firstHabitId);
    await repository.readOwnedMany(userId, [firstHabitId, secondHabitId]);

    expect(recorder.queries).toHaveLength(2);
    for (const query of recorder.queries) {
      expect(query.sql).toContain('from "habits"');
      expect(query.sql).toContain('"habits"."user_id" =');
      expect(query.params).toContain(userId);
      expect(query.sql).not.toContain('"habits"."archived_at" is null');
    }
    expect(recorder.queries[0]?.params).toContain(firstHabitId);
    expect(recorder.queries[1]?.sql).toContain('"habits"."id" in');
    expect(recorder.queries[1]?.params).toEqual(expect.arrayContaining([firstHabitId, secondHabitId]));
  });

  it("searches only available owned habits with deterministic bounded ordering", async () => {
    const recorder = createRecorder();

    await createHabitFocusLinkRepository(recorder.executor).searchOwned(userId, {
      q: "  100%_DONE  ",
      limit: 20,
    });

    expect(recorder.queries).toHaveLength(1);
    const query = recorder.queries[0];
    expect(query?.sql).toContain('"habits"."user_id" =');
    expect(query?.sql).toContain('"habits"."archived_at" is null');
    expect(query?.sql).toContain('lower("habits"."title") like');
    expect(query?.sql).toContain('order by lower("habits"."title") asc, "habits"."id" asc');
    expect(query?.params).toEqual(expect.arrayContaining([userId, "%100\\%\\_done%", 20]));
  });

  it("defensively rejects invalid bounds and performs no query for an empty batch", async () => {
    const recorder = createRecorder();
    const repository = createHabitFocusLinkRepository(recorder.executor);

    await expect(repository.readOwnedMany(userId, [])).resolves.toEqual([]);
    await expect(repository.readOwnedMany(userId, [firstHabitId, firstHabitId])).rejects.toThrow(RangeError);
    await expect(repository.searchOwned(userId, { q: " ", limit: 20 })).rejects.toThrow(RangeError);
    await expect(repository.searchOwned(userId, { q: "unsafe\0query", limit: 20 })).rejects.toThrow(
      RangeError,
    );
    await expect(repository.searchOwned(userId, { q: "\ud800", limit: 20 })).rejects.toThrow(RangeError);
    await expect(repository.searchOwned(userId, { q: "🚀".repeat(121), limit: 20 })).rejects.toThrow(
      RangeError,
    );
    await expect(repository.searchOwned(userId, { q: "valid", limit: 21 })).rejects.toThrow(RangeError);
    expect(recorder.queries).toEqual([]);
  });
});
