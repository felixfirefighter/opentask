import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createTaskFocusLinkRepository } from "./task-focus-link-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const firstTaskId = "22222222-2222-4222-8222-222222222222";
const secondTaskId = "33333333-3333-4333-8333-333333333333";

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

describe("task focus-link repository SQL", () => {
  it("scopes single and one-query batch hydration by actor without hiding deleted history", async () => {
    const recorder = createRecorder();
    const repository = createTaskFocusLinkRepository(recorder.executor);

    await repository.readOwned(userId, firstTaskId);
    await repository.readOwnedMany(userId, [firstTaskId, secondTaskId]);

    expect(recorder.queries).toHaveLength(2);
    for (const query of recorder.queries) {
      expect(query.sql).toContain('from "tasks"');
      expect(query.sql).toContain('"tasks"."user_id" =');
      expect(query.params).toContain(userId);
      expect(query.sql).not.toContain('"tasks"."deleted_at" is null');
    }
    expect(recorder.queries[0]?.params).toContain(firstTaskId);
    expect(recorder.queries[1]?.sql).toContain('"tasks"."id" in');
    expect(recorder.queries[1]?.params).toEqual(expect.arrayContaining([firstTaskId, secondTaskId]));
  });

  it("searches only available owned tasks with deterministic bounded ordering", async () => {
    const recorder = createRecorder();

    await createTaskFocusLinkRepository(recorder.executor).searchOwned(userId, {
      q: "  100%_DONE  ",
      limit: 20,
    });

    expect(recorder.queries).toHaveLength(1);
    const query = recorder.queries[0];
    expect(query?.sql).toContain('"tasks"."user_id" =');
    expect(query?.sql).toContain('"tasks"."deleted_at" is null');
    expect(query?.sql).toContain('lower("tasks"."title") like');
    expect(query?.sql).toContain('order by lower("tasks"."title") asc, "tasks"."id" asc');
    expect(query?.params).toEqual(expect.arrayContaining([userId, "%100\\%\\_done%", 20]));
  });

  it("defensively rejects invalid bounds and performs no query for an empty batch", async () => {
    const recorder = createRecorder();
    const repository = createTaskFocusLinkRepository(recorder.executor);

    await expect(repository.readOwnedMany(userId, [])).resolves.toEqual([]);
    await expect(repository.readOwnedMany(userId, [firstTaskId, firstTaskId])).rejects.toThrow(RangeError);
    await expect(repository.searchOwned(userId, { q: " ", limit: 20 })).rejects.toThrow(RangeError);
    await expect(repository.searchOwned(userId, { q: "🚀".repeat(121), limit: 20 })).rejects.toThrow(
      RangeError,
    );
    await expect(repository.searchOwned(userId, { q: "valid", limit: 21 })).rejects.toThrow(RangeError);
    expect(recorder.queries).toEqual([]);
  });
});
