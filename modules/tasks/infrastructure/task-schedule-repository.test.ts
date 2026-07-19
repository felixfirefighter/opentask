import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createTaskSchema } from "./schema";
import { createTaskScheduleRepository } from "./task-schedule-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-19T01:02:03.000Z");
const taskSchedules = createTaskSchema(() => schema.user.id).taskSchedules;

type CapturedQuery = { sql: string; params: unknown[]; method: string };

function createRecorder() {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params, method) => {
    queries.push({ sql, params, method });
    return { rows: [] };
  };
  const database = createProxyDatabase(callback, { schema });
  return { queries, executor: database as unknown as DatabaseExecutor };
}

describe("task schedule repository SQL", () => {
  it("scopes schedule reads and clears by both actor and task", async () => {
    const recorder = createRecorder();
    const repository = createTaskScheduleRepository(taskSchedules, recorder.executor);
    await repository.findByTaskId(userId, taskId);
    await repository.clear(userId, taskId);

    for (const query of recorder.queries) {
      expect(query.sql).toContain('"task_schedules"."user_id" =');
      expect(query.sql).toContain('"task_schedules"."task_id" =');
      expect(query.params).toEqual(expect.arrayContaining([userId, taskId]));
    }
  });

  it("writes exactly one schedule representation and preserves created_at on replacement", async () => {
    const recorder = createRecorder();
    const repository = createTaskScheduleRepository(taskSchedules, recorder.executor);
    await expect(
      repository.upsert({
        userId,
        taskId,
        schedule: { kind: "all_day", startDate: "2026-07-19", endDate: "2026-07-20" },
        now,
      }),
    ).rejects.toThrow("did not return");

    const query = recorder.queries[0];
    expect(query?.sql).toContain('insert into "task_schedules"');
    expect(query?.sql).toContain('on conflict ("user_id","task_id") do update');
    expect(query?.sql).toContain('"start_at" =');
    expect(query?.sql).toContain('"timezone" =');
    expect(query?.sql).not.toContain('"created_at" = excluded');
  });

  it("uses half-open overlap predicates including timed zero-duration points", async () => {
    const recorder = createRecorder();
    await createTaskScheduleRepository(taskSchedules, recorder.executor).listActiveOpenInRange(userId, {
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-07-20",
      rangeStartAt: new Date("2026-07-18T16:00:00Z"),
      rangeEndAt: new Date("2026-07-19T16:00:00Z"),
      limit: 250,
    });

    const query = recorder.queries[0];
    expect(query?.sql).toContain('"task_schedules"."start_date" <');
    expect(query?.sql).toContain('"task_schedules"."end_date" >');
    expect(query?.sql).toContain('"task_schedules"."start_at" <');
    expect(query?.sql).toContain('"task_schedules"."end_at" >');
    expect(query?.sql).toContain('"task_schedules"."start_at" = "task_schedules"."end_at"');
    expect(query?.sql).toContain('"task_schedules"."start_at" >=');
    expect(query?.sql).toContain('"tasks"."status" =');
    expect(query?.sql).toContain('"tasks"."deleted_at" is null');
    expect(query?.params).toContain(userId);
  });

  it("loads snapshots only from owned active open tasks without a schedule", async () => {
    const recorder = createRecorder();
    await createTaskScheduleRepository(taskSchedules, recorder.executor).loadOpenUnscheduled(userId, [
      taskId,
    ]);

    const query = recorder.queries[0];
    expect(query?.sql).toContain('"tasks"."user_id" =');
    expect(query?.sql).toContain('"tasks"."status" =');
    expect(query?.sql).toContain('"tasks"."deleted_at" is null');
    expect(query?.sql).toContain("not exists");
    expect(query?.sql).toContain('from "task_schedules"');
    expect(query?.params).toEqual(expect.arrayContaining([userId, taskId]));
  });

  it("increments the owning task once with actor, lifecycle, and expected-version predicates", async () => {
    const recorder = createRecorder();
    await createTaskScheduleRepository(taskSchedules, recorder.executor).incrementTaskVersion({
      userId,
      taskId,
      expectedVersion: 4,
      now,
    });

    expect(recorder.queries[0]?.sql).toContain('update "tasks"');
    expect(recorder.queries[0]?.sql).toContain('"tasks"."version" + 1');
    expect(recorder.queries[0]?.sql).toContain('"tasks"."user_id" =');
    expect(recorder.queries[0]?.sql).toContain('"tasks"."version" =');
    expect(recorder.queries[0]?.sql).toContain('"tasks"."deleted_at" is null');
    expect(recorder.queries.filter(({ sql }) => sql.startsWith('update "tasks"'))).toHaveLength(1);
  });
});
