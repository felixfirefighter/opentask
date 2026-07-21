import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";

import { createHabitScheduleRepository } from "./habit-schedule-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const habitId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-21T01:02:03.000Z");

type CapturedQuery = { sql: string; params: unknown[] };

function createRecorder() {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [] };
  };
  return { queries, executor: createProxyDatabase(callback) as unknown as DatabaseExecutor };
}

describe("habit schedule repository SQL", () => {
  it("scopes reads, locks, and sets by actor plus habit", async () => {
    const recorder = createRecorder();
    const repository = createHabitScheduleRepository(recorder.executor);

    await repository.findByHabitId(userId, habitId);
    await repository.lockByHabitId(userId, habitId);
    await repository.replace({
      userId,
      habitId,
      schedule: {
        kind: "weekdays",
        weekdays: [1, 3, 5],
        targetPerWeek: null,
        timezone: "Asia/Singapore",
        startDate: "2026-07-21",
        endDate: null,
      },
      now,
    });

    for (const query of recorder.queries) {
      expect(query.sql).toContain('"habit_schedules"."user_id" =');
      expect(query.sql).toContain('"habit_schedules"."habit_id" =');
      expect(query.params).toEqual(expect.arrayContaining([userId, habitId]));
    }
    expect(recorder.queries[1]?.sql).toContain("for update");
    expect(recorder.queries[2]?.sql).toContain('update "habit_schedules"');
  });

  it("keeps bulk reads actor-scoped", async () => {
    const recorder = createRecorder();
    await createHabitScheduleRepository(recorder.executor).listForHabitIds(userId, [habitId]);

    expect(recorder.queries[0]?.sql).toContain('"habit_schedules"."user_id" =');
    expect(recorder.queries[0]?.sql).toContain('"habit_schedules"."habit_id" in');
    expect(recorder.queries[0]?.params).toEqual(expect.arrayContaining([userId, habitId]));
  });

  it("bounds page hydration and reads active timezone boundaries as a distinct actor-owned set", async () => {
    const recorder = createRecorder();
    const repository = createHabitScheduleRepository(recorder.executor);

    await expect(
      repository.listForHabitIds(
        userId,
        Array.from(
          { length: 101 },
          (_, index) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
        ),
      ),
    ).rejects.toThrow(RangeError);
    await repository.listDistinctActiveTimezones(userId);

    expect(recorder.queries).toHaveLength(1);
    expect(recorder.queries[0]?.sql).toContain("select distinct");
    expect(recorder.queries[0]?.sql).toContain('inner join "habits"');
    expect(recorder.queries[0]?.sql).toContain('"habits"."archived_at" is null');
    expect(recorder.queries[0]?.params).toContain(userId);
  });
});
