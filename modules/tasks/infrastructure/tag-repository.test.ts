import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor, DatabaseTransaction } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createTagRepository } from "./tag-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const tagId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-07-19T01:02:03.000Z");

type CapturedQuery = { sql: string; params: unknown[]; method: string };

function createRecorder(respond?: (query: CapturedQuery) => unknown[][]) {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params, method) => {
    const query = { sql, params, method };
    queries.push(query);
    return { rows: respond?.(query) ?? [] };
  };
  const database = createProxyDatabase(callback, { schema });
  return {
    queries,
    executor: database as unknown as DatabaseExecutor,
    transaction: database as unknown as DatabaseTransaction,
  };
}

describe("tag repository SQL scoping", () => {
  it("scopes active reads by user and hides deleted tags", async () => {
    const recorder = createRecorder();
    const repository = createTagRepository(recorder.executor);

    await repository.findActiveById(userId, tagId);
    await repository.listActive(userId, {
      limit: 20,
      after: { normalizedName: "launch", id: tagId },
    });

    expect(recorder.queries).toHaveLength(2);
    for (const query of recorder.queries) {
      expect(query.sql).toContain('"tags"."user_id" =');
      expect(query.params).toContain(userId);
    }
    expect(recorder.queries[0]?.sql).toContain('"tags"."deleted_at" is null');
    expect(recorder.queries[1]?.sql).toContain(
      'order by lower(normalize("tags"."name", NFKC)) asc, "tags"."id" asc',
    );
  });

  it("supports user-scoped NFKC and case-equivalent duplicate detection", async () => {
    const recorder = createRecorder();
    const repository = createTagRepository(recorder.executor);

    await repository.findActiveEquivalentName(userId, "Ｆｏｃｕｓ", tagId);

    const query = recorder.queries[0];
    expect(query?.sql).toContain('lower(normalize("tags"."name", NFKC))');
    expect(query?.sql).toContain('"tags"."user_id" =');
    expect(query?.sql).toContain('"tags"."id" <>');
    expect(query?.sql).toContain('"tags"."deleted_at" is null');
    expect(query?.params).toEqual(expect.arrayContaining([userId, tagId, "Ｆｏｃｕｓ"]));
  });

  it("provides a transaction advisory lock for compatibility-equivalent name mutations", async () => {
    const recorder = createRecorder();
    await createTagRepository(recorder.executor).lockNameMutations(userId, recorder.transaction);
    expect(recorder.queries[0]?.sql).toContain("pg_advisory_xact_lock(hashtextextended(");
    expect(recorder.queries[0]?.params).toContain(`omplish:tag-name:${userId}`);
  });

  it("uses idempotent inserts and user/version-scoped lifecycle updates", async () => {
    const recorder = createRecorder();
    const repository = createTagRepository(recorder.executor);

    await repository.insert({ id: tagId, userId, name: "Launch", colorToken: "coral", now });
    await repository.update({
      id: tagId,
      userId,
      expectedVersion: 1,
      patch: { colorToken: "sky" },
      now,
    });
    await repository.softDelete({ id: tagId, userId, expectedVersion: 2, now });
    await repository.restore({ id: tagId, userId, expectedVersion: 3, now });

    expect(recorder.queries[0]?.sql).toContain('on conflict ("user_id","id") do nothing');
    for (const query of recorder.queries.slice(1)) {
      expect(query.sql).toContain('"tags"."user_id" =');
      expect(query.sql).toContain('"tags"."version" =');
      expect(query.params).toContain(userId);
    }
    expect(recorder.queries[2]?.sql).not.toContain("task_tags");
    expect(recorder.queries[2]?.sql).toContain('"deleted_at" =');
    expect(recorder.queries[3]?.sql).toContain('"tags"."deleted_at" is not null');
  });

  it("scopes task-tag reads by active task and tag state", async () => {
    const recorder = createRecorder();
    const repository = createTagRepository(recorder.executor);

    await repository.listActiveForTask(userId, taskId);

    for (const query of recorder.queries) {
      expect(query.sql).toContain('inner join "tasks"');
      expect(query.sql).toContain('inner join "tags"');
      expect(query.sql).toContain('"task_tags"."user_id" =');
      expect(query.sql).toContain('"tasks"."user_id" =');
      expect(query.sql).toContain('"tags"."user_id" =');
      expect(query.params).toContain(userId);
    }
    expect(recorder.queries[0]?.sql).toContain('"tasks"."deleted_at" is null');
    expect(recorder.queries[0]?.sql).toContain('"tags"."deleted_at" is null');
  });

  it("rejects invalid page bounds before issuing SQL", async () => {
    const recorder = createRecorder();
    const repository = createTagRepository(recorder.executor);
    expect(() => repository.listActive(userId, { limit: 102 })).toThrow(RangeError);
    expect(recorder.queries).toHaveLength(0);
  });

  it("resolves an owned active compatibility-name anchor to the exact SQL pagination key", async () => {
    const recorder = createRecorder(({ sql }) => (sql.includes('from "tags"') ? [["focus"]] : []));

    const cursor = await createTagRepository(recorder.executor).resolveActivePageCursor(userId, tagId);

    expect(cursor).toEqual({ normalizedName: "focus", id: tagId });
    expect(recorder.queries[0]?.sql).toContain('lower(normalize("name", NFKC))');
    expect(recorder.queries[0]?.sql).toContain('"tags"."user_id" =');
    expect(recorder.queries[0]?.sql).toContain('"tags"."id" =');
    expect(recorder.queries[0]?.sql).toContain('"tags"."deleted_at" is null');
  });
});

describe("atomic task-tag replacement", () => {
  it("locks scoped records, replaces joins, and increments the task exactly once", async () => {
    const timestamp = now.toISOString();
    const recorder = createRecorder(({ sql }) => {
      if (sql.includes('from "tasks"') && sql.includes("for update")) return [[taskId, 4]];
      if (sql.includes('from "tags"') && sql.includes("for share")) {
        return [[tagId, userId, "Launch", "coral", 1, timestamp, timestamp, null]];
      }
      if (sql.startsWith('update "tasks"')) return [[5]];
      return [];
    });
    const repository = createTagRepository(recorder.executor);

    const result = await repository.replaceForActiveTask(
      { userId, taskId, expectedTaskVersion: 4, tagIds: [tagId], now },
      recorder.transaction,
    );

    expect(result).toMatchObject({
      kind: "updated",
      taskId,
      version: 5,
      tags: [{ id: tagId, userId, name: "Launch" }],
    });
    expect(recorder.queries).toHaveLength(5);
    expect(recorder.queries[0]?.sql).toContain('"tasks"."user_id" =');
    expect(recorder.queries[0]?.sql).toContain('select "id", "version" from "tasks"');
    expect(recorder.queries[0]?.sql).toContain('"tasks"."deleted_at" is null');
    expect(recorder.queries[1]?.sql).toContain('"tags"."user_id" =');
    expect(recorder.queries[1]?.sql).toContain('"tags"."deleted_at" is null');
    expect(recorder.queries[2]?.sql).toContain('delete from "task_tags"');
    expect(recorder.queries[2]?.sql).toContain('"tags"."deleted_at" is null');
    expect(recorder.queries[2]?.sql).toContain('"tags"."user_id" =');
    expect(recorder.queries[3]?.sql).toContain('insert into "task_tags"');
    expect(recorder.queries[4]?.sql).toContain('update "tasks"');
    expect(recorder.queries[4]?.sql).toContain('"tasks"."version" =');
    expect(recorder.queries[4]?.sql).toContain('"tasks"."version" + 1');
    expect(recorder.queries.filter(({ sql }) => sql.startsWith('update "tasks"'))).toHaveLength(1);
  });

  it("distinguishes scoped task absence/staleness from one non-leaking tag conflict", async () => {
    const missingTask = createRecorder();
    const repository = createTagRepository(missingTask.executor);
    await expect(
      repository.replaceForActiveTask(
        { userId: otherUserId, taskId, expectedTaskVersion: 1, tagIds: [tagId], now },
        missingTask.transaction,
      ),
    ).resolves.toEqual({ kind: "task_not_found" });
    expect(missingTask.queries).toHaveLength(1);

    const duplicate = createRecorder();
    await expect(
      createTagRepository(duplicate.executor).replaceForActiveTask(
        { userId, taskId, expectedTaskVersion: 1, tagIds: [tagId, tagId], now },
        duplicate.transaction,
      ),
    ).resolves.toEqual({ kind: "tag_conflict" });
    expect(duplicate.queries).toHaveLength(0);

    const missingTag = createRecorder(({ sql }) =>
      sql.includes('from "tasks"') && sql.includes("for update") ? [[taskId, 1]] : [],
    );
    await expect(
      createTagRepository(missingTag.executor).replaceForActiveTask(
        { userId, taskId, expectedTaskVersion: 1, tagIds: [tagId], now },
        missingTag.transaction,
      ),
    ).resolves.toEqual({ kind: "tag_conflict" });
    expect(missingTag.queries).toHaveLength(2);

    const stale = createRecorder(({ sql }) =>
      sql.includes('from "tasks"') && sql.includes("for update") ? [[taskId, 7]] : [],
    );
    await expect(
      createTagRepository(stale.executor).replaceForActiveTask(
        { userId, taskId, expectedTaskVersion: 6, tagIds: [], now },
        stale.transaction,
      ),
    ).resolves.toEqual({ kind: "task_stale", currentVersion: 7 });
    expect(stale.queries).toHaveLength(1);
  });
});
