import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CANONICAL_IANA_TIME_ZONES } from "../../shared/validation/canonical-time-zones.ts";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p3_habit_constraints");
let pool: Pool;
let ownerId: string;
let strangerId: string;

describe("P3 habit PostgreSQL invariants", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    ownerId = await insertUser(pool, "p3-habit-owner");
    strangerId = await insertUser(pool, "p3-habit-stranger");
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("requires one canonical schedule in the same transaction", async () => {
    const habitId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await insertHabit(client, ownerId, habitId, { kind: "boolean" });
      await expectPostgresError(client.query("commit"), "23514");
      await client.query("rollback");
    } finally {
      client.release();
    }

    await insertHabitGraph(ownerId, habitId, { kind: "boolean" }, dailySchedule());
    await expect(countRows("habits", ownerId, habitId)).resolves.toBe(1);

    const deleteClient = await pool.connect();
    try {
      await deleteClient.query("begin");
      await deleteClient.query(`delete from habit_schedules where user_id = $1 and habit_id = $2`, [
        ownerId,
        habitId,
      ]);
      await expectPostgresError(deleteClient.query("commit"), "23514");
      await deleteClient.query("rollback");
    } finally {
      deleteClient.release();
    }
    await expect(countRows("habit_schedules", ownerId, habitId)).resolves.toBe(1);

    const movedHabitId = randomUUID();
    const moveClient = await pool.connect();
    try {
      await moveClient.query("begin");
      await insertHabit(moveClient, ownerId, movedHabitId, { kind: "boolean" });
      await moveClient.query(
        `update habit_schedules set habit_id = $1 where user_id = $2 and habit_id = $3`,
        [movedHabitId, ownerId, habitId],
      );
      await expectPostgresError(moveClient.query("commit"), "23514");
      await moveClient.query("rollback");
    } finally {
      moveClient.release();
    }
    await expect(countRows("habit_schedules", ownerId, habitId)).resolves.toBe(1);
    await expect(countRows("habits", ownerId, movedHabitId)).resolves.toBe(0);
  });

  it("enforces normalized bounded definitions and exact goal shapes", async () => {
    await expectInvalidHabit({ kind: "boolean", title: "  blank edge  " });
    await expectInvalidHabit({ kind: "boolean", title: "e\u0301" });
    await expectInvalidHabit({ kind: "boolean", title: "x".repeat(201) });
    await expectInvalidHabit({ kind: "boolean", icon: "x".repeat(17) });
    await expectInvalidHabit({ kind: "quantity", targetValue: null, unit: "pages" });
    await expectInvalidHabit({ kind: "quantity", targetValue: 0, unit: "pages" });
    await expectInvalidHabit({ kind: "quantity", targetValue: 1, unit: "" });
    await expectInvalidHabit({ kind: "quantity", targetValue: 1, unit: "u".repeat(41) });
    await expectInvalidHabit({ kind: "boolean", targetValue: 1, unit: "pages" });

    const habitId = randomUUID();
    await insertHabitGraph(
      ownerId,
      habitId,
      { kind: "quantity", targetValue: 999_999_999.999, unit: "pages" },
      dailySchedule(),
    );
    await expect(countRows("habits", ownerId, habitId)).resolves.toBe(1);
  });

  it("rejects mixed schedule discriminants, invalid dates, and non-IANA zones", async () => {
    await expectInvalidSchedule({ kind: "daily", weekdays: [1], targetPerWeek: null });
    await expectInvalidSchedule({ kind: "weekdays", weekdays: null, targetPerWeek: null });
    await expectInvalidSchedule({ kind: "weekdays", weekdays: [1, 1], targetPerWeek: null });
    await expectInvalidSchedule({ kind: "weekdays", weekdays: [2, 1], targetPerWeek: null });
    await expectInvalidSchedule({ kind: "weekdays", weekdays: [0, 1], targetPerWeek: null });
    await expectInvalidSchedule({ kind: "weekly_target", weekdays: null, targetPerWeek: 0 });
    await expectInvalidSchedule({ kind: "weekly_target", weekdays: null, targetPerWeek: 8 });
    await expectInvalidSchedule({
      kind: "daily",
      weekdays: null,
      targetPerWeek: null,
      timezone: "Mars/Olympus",
    });
    await expectInvalidSchedule({
      kind: "daily",
      weekdays: null,
      targetPerWeek: null,
      startDate: "2026-07-20",
      endDate: "2026-07-19",
    });
    for (const startDate of ["-infinity", "infinity", "0001-01-01 BC"]) {
      await expectInvalidSchedule({ ...dailySchedule(), startDate });
    }
    await expectInvalidSchedule({ ...dailySchedule(), endDate: "infinity" });

    await insertHabitGraph(
      ownerId,
      randomUUID(),
      { kind: "boolean" },
      {
        kind: "weekdays",
        weekdays: [1, 3, 5],
        targetPerWeek: null,
        timezone: "America/New_York",
        startDate: "2026-03-01",
        endDate: null,
      },
    );
  });

  it("rejects null-bearing, multidimensional, and noncanonical-bound weekday arrays", async () => {
    const result = await pool.query<{ value: boolean }>(
      `select habit_weekdays_are_canonical(candidate) as value
         from (values
           ('{1,NULL,3}'::smallint[]),
           ('{{1,2},{3,4}}'::smallint[]),
           ('[0:1]={7,1}'::smallint[]),
           ('[2:2]={0}'::smallint[])
         ) as malformed(candidate)`,
    );
    expect(result.rows).toEqual([{ value: false }, { value: false }, { value: false }, { value: false }]);
  });

  it("keeps PostgreSQL timezone validation exactly aligned with the generated TS allowlist", async () => {
    const definition = await pool.query<{ source: string }>(
      `select procedure_record.prosrc as source
         from pg_proc procedure_record
         join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
        where namespace_record.nspname = current_schema()
          and procedure_record.proname = 'habit_timezone_is_valid'`,
    );
    const storedLiterals = [...(definition.rows[0]?.source ?? "").matchAll(/'([^']+)'/g)].map(
      ([, value]) => value,
    );
    expect(storedLiterals).toEqual(CANONICAL_IANA_TIME_ZONES);

    const accepted = await pool.query<{ value: string; valid: boolean }>(
      `select value, habit_timezone_is_valid(value) as valid
         from unnest($1::text[]) as canonical(value)`,
      [CANONICAL_IANA_TIME_ZONES],
    );
    expect(accepted.rows).toHaveLength(CANONICAL_IANA_TIME_ZONES.length);
    expect(accepted.rows.every(({ valid }) => valid)).toBe(true);

    const mismatches = await pool.query<{ value: string }>(
      `with candidates(value) as (
         select unnest($1::text[])
         union
         select name from pg_timezone_names
       )
       select value
         from candidates
        where habit_timezone_is_valid(value) is distinct from (value = any($1::text[]))`,
      [CANONICAL_IANA_TIME_ZONES],
    );
    expect(mismatches.rows).toEqual([]);
    const aliases = await pool.query<{ alias: string; valid: boolean }>(
      `select alias, habit_timezone_is_valid(alias) as valid
         from unnest(array['US/Eastern', 'Etc/UTC']) as aliases(alias)`,
    );
    expect(aliases.rows).toEqual([
      { alias: "US/Eastern", valid: false },
      { alias: "Etc/UTC", valid: false },
    ]);
  });

  it("uses tenant-leading foreign keys for schedules and logs", async () => {
    const habitId = randomUUID();
    await insertHabitGraph(ownerId, habitId, { kind: "boolean" }, dailySchedule());

    await expectPostgresError(
      pool.query(
        `insert into habit_schedules
           (user_id, habit_id, kind, timezone, start_date)
         values ($1, $2, 'daily', 'UTC', '2026-07-20')`,
        [strangerId, habitId],
      ),
      "23503",
    );
    await expectPostgresError(
      pool.query(
        `insert into habit_logs
           (id, user_id, habit_id, local_date, state)
         values ($1, $2, $3, '2026-07-20', 'completed')`,
        [randomUUID(), strangerId, habitId],
      ),
      "23503",
    );
  });

  it("enforces goal-aware log shape and note bounds", async () => {
    const booleanHabitId = randomUUID();
    const quantityHabitId = randomUUID();
    await insertHabitGraph(ownerId, booleanHabitId, { kind: "boolean" }, dailySchedule());
    await insertHabitGraph(
      ownerId,
      quantityHabitId,
      { kind: "quantity", targetValue: 5, unit: "pages" },
      dailySchedule(),
    );

    await expectInvalidLog(booleanHabitId, "completed", 1, null);
    await expectInvalidLog(quantityHabitId, "completed", null, null);
    await expectInvalidLog(quantityHabitId, "skipped", 1, null);
    await expectInvalidLog(quantityHabitId, "unachieved", 1, null);
    await expectInvalidLog(quantityHabitId, "completed", -0.001, null);
    await expectInvalidLog(quantityHabitId, "completed", 1, "x".repeat(1001));
    await expectInvalidLog(quantityHabitId, "completed", 1, "e\u0301");
    await expectInvalidLogDate(booleanHabitId, "infinity");
    await expectInvalidLogDate(booleanHabitId, "-infinity");
    await expectInvalidLogDate(booleanHabitId, "0001-01-01 BC");

    await pool.query(
      `insert into habit_logs
         (id, user_id, habit_id, local_date, state, quantity, note)
       values ($1, $2, $3, '2026-07-20', 'completed', 5.250, 'Read deliberately')`,
      [randomUUID(), ownerId, quantityHabitId],
    );
    await pool.query(
      `insert into habit_logs
         (id, user_id, habit_id, local_date, state, note)
       values ($1, $2, $3, '2026-07-20', 'completed', '')`,
      [randomUUID(), ownerId, booleanHabitId],
    );
  });

  it("allows one effective same-day log under concurrent inserts", async () => {
    const habitId = randomUUID();
    await insertHabitGraph(ownerId, habitId, { kind: "boolean" }, dailySchedule());
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await second.query("begin");
      await first.query(
        `insert into habit_logs (id, user_id, habit_id, local_date, state)
         values ($1, $2, $3, '2026-07-21', 'completed')`,
        [randomUUID(), ownerId, habitId],
      );
      const competing = second.query(
        `insert into habit_logs (id, user_id, habit_id, local_date, state)
         values ($1, $2, $3, '2026-07-21', 'skipped')`,
        [randomUUID(), ownerId, habitId],
      );
      await first.query("commit");
      await expectPostgresError(competing, "23505");
      await second.query("rollback");
    } finally {
      first.release();
      second.release();
    }

    const rows = await pool.query<{ state: string }>(
      `select state from habit_logs
        where user_id = $1 and habit_id = $2 and local_date = '2026-07-21'`,
      [ownerId, habitId],
    );
    expect(rows.rows).toEqual([{ state: "completed" }]);
  });
});

type HabitGoalInput = {
  kind: "boolean" | "quantity";
  title?: string;
  icon?: string;
  targetValue?: number | null;
  unit?: string | null;
};

type ScheduleInput = {
  kind: "daily" | "weekdays" | "weekly_target";
  weekdays: number[] | null;
  targetPerWeek: number | null;
  timezone?: string;
  startDate?: string;
  endDate?: string | null;
};

function dailySchedule(): ScheduleInput {
  return {
    kind: "daily",
    weekdays: null,
    targetPerWeek: null,
    timezone: "Asia/Singapore",
    startDate: "2026-07-20",
    endDate: null,
  };
}

async function insertHabitGraph(
  userId: string,
  habitId: string,
  goal: HabitGoalInput,
  schedule: ScheduleInput,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await insertHabit(client, userId, habitId, goal);
    await insertSchedule(client, userId, habitId, schedule);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function insertHabit(client: PoolClient, userId: string, habitId: string, goal: HabitGoalInput) {
  return client.query(
    `insert into habits
       (id, user_id, title, icon, color_token, goal_kind, target_value, unit)
     values ($1, $2, $3, $4, 'mint', $5, $6, $7)`,
    [
      habitId,
      userId,
      goal.title ?? "Read every day",
      goal.icon ?? "📚",
      goal.kind,
      goal.targetValue ?? null,
      goal.unit ?? null,
    ],
  );
}

function insertSchedule(client: PoolClient, userId: string, habitId: string, schedule: ScheduleInput) {
  return client.query(
    `insert into habit_schedules
       (user_id, habit_id, kind, weekdays, target_per_week, timezone, start_date, end_date)
     values ($1, $2, $3, $4::smallint[], $5, $6, $7, $8)`,
    [
      userId,
      habitId,
      schedule.kind,
      schedule.weekdays,
      schedule.targetPerWeek,
      schedule.timezone ?? "UTC",
      schedule.startDate ?? "2026-07-20",
      schedule.endDate ?? null,
    ],
  );
}

async function expectInvalidHabit(goal: HabitGoalInput) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await expectPostgresError(insertHabit(client, ownerId, randomUUID(), goal), "23514");
    await client.query("rollback");
  } finally {
    client.release();
  }
}

async function expectInvalidSchedule(schedule: ScheduleInput) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const habitId = randomUUID();
    await insertHabit(client, ownerId, habitId, { kind: "boolean" });
    await expectPostgresError(insertSchedule(client, ownerId, habitId, schedule), "23514");
    await client.query("rollback");
  } finally {
    client.release();
  }
}

async function expectInvalidLog(
  habitId: string,
  state: "completed" | "skipped" | "unachieved",
  quantity: number | null,
  note: string | null,
) {
  await expectPostgresError(
    pool.query(
      `insert into habit_logs
         (id, user_id, habit_id, local_date, state, quantity, note)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), ownerId, habitId, randomLocalDate(), state, quantity, note],
    ),
    "23514",
  );
}

async function expectInvalidLogDate(habitId: string, localDate: string) {
  await expectPostgresError(
    pool.query(
      `insert into habit_logs
         (id, user_id, habit_id, local_date, state)
       values ($1, $2, $3, $4, 'completed')`,
      [randomUUID(), ownerId, habitId, localDate],
    ),
    "23514",
  );
}

let invalidLogDate = 1;
function randomLocalDate() {
  const day = String(invalidLogDate++).padStart(2, "0");
  return `2026-08-${day}`;
}

async function countRows(table: "habits" | "habit_schedules", userId: string, habitId: string) {
  const idColumn = table === "habits" ? "id" : "habit_id";
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from ${table} where user_id = $1 and ${idColumn} = $2`,
    [userId, habitId],
  );
  return result.rows[0]?.count ?? 0;
}
