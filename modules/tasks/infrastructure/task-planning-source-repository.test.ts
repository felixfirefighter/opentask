import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createTaskPlanningSourceRepository } from "./task-planning-source-repository";

const userId = "11111111-1111-4111-8111-111111111111";

function createRecorder() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const callback: RemoteCallback = async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [] };
  };
  return {
    queries,
    executor: createProxyDatabase(callback, { schema }) as unknown as DatabaseExecutor,
  };
}

describe("task planning source repository SQL", () => {
  it("tenant-scopes every mode and filters active open tasks in SQL", async () => {
    const recorder = createRecorder();
    const repository = createTaskPlanningSourceRepository(schema.taskSchedules, recorder.executor);
    await repository.listScheduledThrough(userId, {
      exclusiveEndDate: "2026-07-20",
      exclusiveEndAt: new Date("2026-07-19T16:00:00Z"),
      limit: 20,
    });
    await repository.listScheduledRange(userId, {
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-07-20",
      rangeStartAt: new Date("2026-07-18T16:00:00Z"),
      rangeEndAt: new Date("2026-07-19T16:00:00Z"),
      limit: 20,
    });
    await repository.listAllOpen(userId, 20);

    expect(recorder.queries).toHaveLength(3);
    for (const query of recorder.queries) {
      expect(query.sql).toContain('"tasks"."user_id" =');
      expect(query.sql).toContain('"tasks"."status" =');
      expect(query.sql).toContain('"tasks"."deleted_at" is null');
      expect(query.params).toContain(userId);
    }
    expect(recorder.queries[0]?.sql).toContain('"task_schedules"."start_date" <');
    expect(recorder.queries[0]?.sql).toContain('"task_schedules"."start_at" <');
    expect(recorder.queries[1]?.sql).toContain('"task_schedules"."end_date" >');
    expect(recorder.queries[1]?.sql).toContain('"task_schedules"."start_at" = "task_schedules"."end_at"');
    expect(recorder.queries[2]?.sql).toContain('left join "task_schedules"');
  });
});
