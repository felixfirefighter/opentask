import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";

import { createHabitRepository } from "./habit-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const habitId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-21T01:02:03.000Z");

type CapturedQuery = { sql: string; params: unknown[]; method: string };

function createRecorder() {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params, method) => {
    queries.push({ sql, params, method });
    return { rows: [] };
  };
  return {
    queries,
    executor: createProxyDatabase(callback) as unknown as DatabaseExecutor,
  };
}

describe("habit repository SQL", () => {
  it("scopes definition reads, locks, page anchors, and lifecycle pages by actor", async () => {
    const recorder = createRecorder();
    const repository = createHabitRepository(recorder.executor);
    await repository.findById(userId, habitId);
    await repository.lockById(userId, habitId);
    await repository.listPageByLifecycle(userId, "active", { limit: 51 });
    await repository.listPageByLifecycle(userId, "archived", {
      limit: 51,
      after: { id: habitId, updatedAt: now },
    });
    await repository.findPageAnchor(userId, "active", habitId);

    for (const query of recorder.queries) {
      expect(query.sql).toContain('"habits"."user_id" =');
      expect(query.params).toContain(userId);
    }
    expect(recorder.queries[1]?.sql).toContain("for update");
    expect(recorder.queries[2]?.sql).toContain('"habits"."archived_at" is null');
    expect(recorder.queries[3]?.sql).toContain('"habits"."archived_at" is not null');
    expect(recorder.queries[3]?.sql).toContain('"habits"."updated_at" <');
    expect(recorder.queries[3]?.sql).toContain('"habits"."id" >');
    expect(recorder.queries[4]?.params).toEqual(expect.arrayContaining([userId, habitId]));
  });

  it("rejects any requested database page beyond the public look-ahead maximum", async () => {
    const recorder = createRecorder();
    const repository = createHabitRepository(recorder.executor);

    await expect(repository.listPageByLifecycle(userId, "active", { limit: 102 })).rejects.toThrow(
      RangeError,
    );
    expect(recorder.queries).toEqual([]);
  });

  it("uses actor, expected version, and lifecycle predicates for definition writes", async () => {
    const recorder = createRecorder();
    await createHabitRepository(recorder.executor).updateDefinition({
      userId,
      id: habitId,
      expectedVersion: 3,
      definition: {
        title: "Walk outside",
        icon: "🌿",
        colorToken: "mint",
        goalKind: "boolean",
        targetValue: null,
        unit: null,
      },
      now,
    });

    const update = recorder.queries[0];
    expect(update?.sql).toContain('update "habits"');
    expect(update?.sql).toContain('"habits"."version" + 1');
    expect(update?.sql).toContain('"habits"."user_id" =');
    expect(update?.sql).toContain('"habits"."id" =');
    expect(update?.sql).toContain('"habits"."version" =');
    expect(update?.sql).toContain('"habits"."archived_at" is null');
    expect(update?.params).toEqual(expect.arrayContaining([userId, habitId, 3]));
  });
});
