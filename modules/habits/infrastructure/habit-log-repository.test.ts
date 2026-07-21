import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";

import { createHabitLogRepository } from "./habit-log-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const habitId = "22222222-2222-4222-8222-222222222222";
const logId = "33333333-3333-4333-8333-333333333333";
const localDate = "2026-07-21";
const now = new Date("2026-07-21T01:02:03.000Z");

type CapturedQuery = { sql: string; params: unknown[]; method: string };

function createRecorder() {
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params, method) => {
    queries.push({ sql, params, method });
    return { rows: [] };
  };
  return { queries, executor: createProxyDatabase(callback) as unknown as DatabaseExecutor };
}

describe("habit log repository SQL", () => {
  it("scopes every day read and lock by actor, habit, and local date", async () => {
    const recorder = createRecorder();
    const repository = createHabitLogRepository(recorder.executor);
    await repository.findByHabitDate(userId, habitId, localDate);
    await repository.lockByHabitDate(userId, habitId, localDate);

    for (const query of recorder.queries) {
      expect(query.sql).toContain('"habit_logs"."user_id" =');
      expect(query.sql).toContain('"habit_logs"."habit_id" =');
      expect(query.sql).toContain('"habit_logs"."local_date" =');
      expect(query.params).toEqual(expect.arrayContaining([userId, habitId, localDate]));
    }
    expect(recorder.queries[1]?.sql).toContain("for update");
  });

  it("scopes identifier, bounded history, and fixed-size projection pages by actor", async () => {
    const recorder = createRecorder();
    const repository = createHabitLogRepository(recorder.executor);
    await repository.findById(userId, logId);
    await repository.lockById(userId, logId);
    await repository.listRangeByHabit(userId, habitId, {
      startDate: "2026-07-01",
      endDate: localDate,
    });
    await repository.listProjectionPage(userId, [habitId], {
      habitId,
      localDate: "2026-07-20",
      id: logId,
    });

    for (const query of recorder.queries) {
      expect(query.sql).toContain('"habit_logs"."user_id" =');
      expect(query.params).toContain(userId);
    }
    expect(recorder.queries[0]?.params).toContain(logId);
    expect(recorder.queries[1]?.sql).toContain("for update");
    expect(recorder.queries[2]?.params).toEqual(expect.arrayContaining([habitId, "2026-07-01", localDate]));
    expect(recorder.queries[3]?.params).toContain(habitId);
    expect(recorder.queries[3]?.sql).toContain('"habit_logs"."habit_id" >');
    expect(recorder.queries[3]?.sql).toContain('"habit_logs"."local_date" >');
    expect(recorder.queries[3]?.sql).toContain("limit");
  });

  it("rejects projection hydration for more than one public habit page", async () => {
    const recorder = createRecorder();
    const repository = createHabitLogRepository(recorder.executor);

    await expect(
      repository.listProjectionPage(
        userId,
        Array.from(
          { length: 101 },
          (_, index) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
        ),
        undefined,
      ),
    ).rejects.toThrow(RangeError);
    expect(recorder.queries).toEqual([]);
  });

  it("creates through both unique constraints and conditionally updates one owned log version", async () => {
    const recorder = createRecorder();
    const repository = createHabitLogRepository(recorder.executor);
    await repository.insert({
      id: logId,
      userId,
      habitId,
      localDate,
      value: { state: "completed", quantity: 3, note: null },
      now,
    });
    await repository.update({
      userId,
      habitId,
      localDate,
      expectedVersion: 2,
      value: { state: "completed", quantity: 4, note: "Adjusted" },
      now,
    });

    expect(recorder.queries[0]?.sql).toContain('insert into "habit_logs"');
    expect(recorder.queries[0]?.sql).toContain("on conflict do nothing");
    expect(recorder.queries[1]?.sql).toContain('update "habit_logs"');
    expect(recorder.queries[1]?.sql).toContain('"habit_logs"."version" + 1');
    expect(recorder.queries[1]?.sql).toContain('"habit_logs"."user_id" =');
    expect(recorder.queries[1]?.sql).toContain('"habit_logs"."habit_id" =');
    expect(recorder.queries[1]?.sql).toContain('"habit_logs"."local_date" =');
    expect(recorder.queries[1]?.sql).toContain('"habit_logs"."version" =');
  });

  it("conditionally removes exactly one owned habit-day version", async () => {
    const recorder = createRecorder();
    await createHabitLogRepository(recorder.executor).remove({
      userId,
      habitId,
      localDate,
      expectedVersion: 4,
    });

    const removal = recorder.queries[0];
    expect(removal?.sql).toContain('delete from "habit_logs"');
    expect(removal?.sql).toContain('"habit_logs"."user_id" =');
    expect(removal?.sql).toContain('"habit_logs"."habit_id" =');
    expect(removal?.sql).toContain('"habit_logs"."local_date" =');
    expect(removal?.sql).toContain('"habit_logs"."version" =');
    expect(removal?.params).toEqual(expect.arrayContaining([userId, habitId, localDate, 4]));
  });
});
