import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createTaskSearchRepository } from "./task-search-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const secondTaskId = "33333333-3333-4333-8333-333333333333";
const listId = "44444444-4444-4444-8444-444444444444";
const tagId = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-07-19T01:02:03.000Z";

type CapturedQuery = { sql: string; params: unknown[]; method: string };

function createRecorder(respond?: (query: CapturedQuery) => unknown[][]) {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params, method) => {
    const query = { sql, params, method };
    queries.push(query);
    return { rows: respond?.(query) ?? [] };
  };
  const database = createProxyDatabase(callback, { schema });
  return { queries, executor: database as unknown as DatabaseExecutor };
}

function searchTaskRow(id: string, updatedAt: string, matches: [boolean, boolean, boolean]) {
  return [
    id,
    userId,
    listId,
    null,
    null,
    "Ship the demo",
    "Verify the release",
    "open",
    "high",
    "a0",
    timestamp,
    1,
    timestamp,
    updatedAt,
    null,
    "Launch",
    ...matches,
  ];
}

describe("task search repository", () => {
  it("uses user-scoped partial-trigram query shapes for task and active-tag matching", async () => {
    const recorder = createRecorder();
    await createTaskSearchRepository(recorder.executor).search(userId, { q: "Violet signal", limit: 20 });

    expect(recorder.queries).toHaveLength(1);
    const query = recorder.queries[0];
    expect(query?.sql).toContain('"tasks"."user_id" =');
    expect(query?.sql).toContain('"task_lists"."user_id" =');
    expect(query?.sql).toContain('"tasks"."deleted_at" is null');
    expect(query?.sql).toContain('lower("tasks"."title") like');
    expect(query?.sql).toContain('lower("tasks"."description_md") like');
    expect(query?.sql).toContain('from "task_tags"');
    expect(query?.sql).toContain('"task_tags"."user_id" =');
    expect(query?.sql).toContain('"tags"."user_id" =');
    expect(query?.sql).toContain('"tags"."deleted_at" is null');
    expect(query?.sql).toContain('lower("tags"."name") like');
    expect(query?.sql).toContain('order by "tasks"."updated_at" desc, "tasks"."id" desc');
    expect(query?.params.filter((parameter) => parameter === userId).length).toBeGreaterThanOrEqual(4);
    expect(query?.params).toContain("%violet signal%");
  });

  it("adds a descending keyset cursor and escapes LIKE wildcard input", async () => {
    const recorder = createRecorder();
    await createTaskSearchRepository(recorder.executor).search(userId, {
      q: "100%_done",
      limit: 10,
      after: { updatedAt: new Date(timestamp), id: taskId },
    });

    const query = recorder.queries[0];
    expect(query?.sql).toContain('"tasks"."updated_at" <');
    expect(query?.sql).toContain('"tasks"."updated_at" =');
    expect(query?.sql).toContain('"tasks"."id" <');
    expect(query?.params).toContain("%100\\%\\_done%");
  });

  it("maps matched fields and matching tags with one batched follow-up query", async () => {
    const recorder = createRecorder(({ sql }) => {
      if (sql.includes('from "tasks"')) return [searchTaskRow(taskId, timestamp, [true, false, true])];
      if (sql.includes('from "task_tags"')) {
        return [[taskId, tagId, userId, "Launch", "coral", 1, timestamp, timestamp, null]];
      }
      return [];
    });

    const result = await createTaskSearchRepository(recorder.executor).search(userId, {
      q: "launch",
      limit: 20,
    });

    expect(result).toMatchObject({
      next: null,
      items: [
        {
          task: { id: taskId, userId, listId, title: "Ship the demo" },
          list: { id: listId, name: "Launch" },
          matchedFields: ["title", "tag"],
          matchingTags: [{ id: tagId, userId, name: "Launch" }],
        },
      ],
    });
    expect(recorder.queries).toHaveLength(2);
    const tagsQuery = recorder.queries[1];
    expect(tagsQuery?.sql).toContain('"task_tags"."user_id" =');
    expect(tagsQuery?.sql).toContain('"tags"."user_id" =');
    expect(tagsQuery?.sql).toContain('"tags"."deleted_at" is null');
    expect(tagsQuery?.params).toContain(userId);
  });

  it("returns a stable next cursor only when the bounded page has another row", async () => {
    const later = "2026-07-19T03:00:00.000Z";
    const earlier = "2026-07-19T02:00:00.000Z";
    const recorder = createRecorder(({ sql }) => {
      if (sql.includes('from "tasks"')) {
        return [
          searchTaskRow(taskId, later, [true, false, false]),
          searchTaskRow(secondTaskId, earlier, [true, false, false]),
        ];
      }
      return [];
    });

    const result = await createTaskSearchRepository(recorder.executor).search(userId, {
      q: "ship",
      limit: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.next).toEqual({ updatedAt: new Date(later), id: taskId });
  });

  it("rejects unbounded or empty searches before issuing SQL", async () => {
    const recorder = createRecorder();
    const repository = createTaskSearchRepository(recorder.executor);
    await expect(repository.search(userId, { q: " ", limit: 20 })).rejects.toThrow(RangeError);
    await expect(repository.search(userId, { q: "x".repeat(121), limit: 20 })).rejects.toThrow(RangeError);
    await expect(repository.search(userId, { q: "valid", limit: 51 })).rejects.toThrow(RangeError);
    expect(recorder.queries).toHaveLength(0);
  });

  it("counts Unicode code points rather than UTF-16 code units at the defensive bound", async () => {
    const recorder = createRecorder();
    const repository = createTaskSearchRepository(recorder.executor);

    await expect(repository.search(userId, { q: "🚀".repeat(120), limit: 20 })).resolves.toEqual({
      items: [],
      next: null,
    });
    await expect(repository.search(userId, { q: "İ".repeat(120), limit: 20 })).resolves.toEqual({
      items: [],
      next: null,
    });
    await expect(repository.search(userId, { q: "🚀".repeat(121), limit: 20 })).rejects.toThrow(RangeError);
    expect(recorder.queries).toHaveLength(2);
  });
});
