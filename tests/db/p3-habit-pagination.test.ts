import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createHabitsApplication, type CreateHabitRequest } from "../../modules/habits/index.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p3_habit_pagination");
const fixedInstant = new Date("2026-07-21T12:00:00.000Z");
let testInstant = fixedInstant;
const clock: Clock = { now: () => new Date(testInstant) };

let pool: Pool;
let database: Database;
let application: ReturnType<typeof createHabitsApplication>;
let owner: AuthenticatedActor;
let stranger: AuthenticatedActor;

describe("P3 bounded habit projection reads", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    application = createHabitsApplication({ database, clock });
  }, 60_000);

  beforeEach(async () => {
    testInstant = fixedInstant;
    owner = { userId: await insertUser(pool, "p3-pagination-owner") };
    stranger = { userId: await insertUser(pool, "p3-pagination-stranger") };
  });

  afterAll(async () => fixture.teardown());

  it("continues definition, overview, and Today pages deterministically without duplicates", async () => {
    const ids = Array.from(
      { length: 5 },
      (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    for (const [index, id] of ids.entries()) {
      await createHabit(id, `Daily routine ${index + 1}`);
    }

    const definitionIds = await collectIds(async (cursor) => {
      const page = await application.definitions.listHabits(owner, {
        lifecycle: "active",
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      return { ids: page.items.map(({ habit }) => habit.id), nextCursor: page.nextCursor };
    });
    const overviewIds = await collectIds(async (cursor) => {
      const page = await application.projections.listHabitOverviews(owner, {
        lifecycle: "active",
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      return { ids: page.items.map(({ detail }) => detail.habit.id), nextCursor: page.nextCursor };
    });
    const todayIds = await collectIds(async (cursor) => {
      const page = await application.projections.getHabitToday(owner, {
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.rows.length).toBeLessThanOrEqual(2);
      return { ids: page.rows.map(({ detail }) => detail.habit.id), nextCursor: page.nextCursor };
    });

    expect(definitionIds).toEqual(ids);
    expect(overviewIds).toEqual(ids);
    expect(todayIds).toEqual(ids);
    expect(new Set(definitionIds).size).toBe(ids.length);
    expect(new Set(overviewIds).size).toBe(ids.length);
    expect(new Set(todayIds).size).toBe(ids.length);
  });

  it("rejects cross-scope, cross-actor, and changed-anchor cursors as invalid or expired", async () => {
    const firstId = "20000000-0000-4000-8000-000000000011";
    const secondId = "20000000-0000-4000-8000-000000000012";
    await createHabit(firstId, "First cursor anchor");
    await createHabit(secondId, "Second cursor anchor");
    const firstPage = await application.definitions.listHabits(owner, {
      lifecycle: "active",
      limit: 1,
    });
    if (!firstPage.nextCursor) throw new Error("The first definition page must continue.");

    await expect(
      application.projections.listHabitOverviews(owner, {
        lifecycle: "active",
        limit: 1,
        cursor: firstPage.nextCursor,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      application.definitions.listHabits(stranger, {
        lifecycle: "active",
        limit: 1,
        cursor: firstPage.nextCursor,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const anchor = firstPage.items[0];
    if (!anchor) throw new Error("The first definition page must have one anchor.");
    testInstant = new Date("2026-07-21T12:01:00.000Z");
    await application.definitions.updateHabit(owner, anchor.habit.id, {
      expectedVersion: anchor.habit.version,
      patch: { title: "Changed cursor anchor" },
    });
    await expect(
      application.definitions.listHabits(owner, {
        lifecycle: "active",
        limit: 1,
        cursor: firstPage.nextCursor,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: "The habit page cursor is invalid or expired.",
    });
  });

  it("streams exact lifetime streaks across fixed-size log batches", async () => {
    const habitId = "20000000-0000-4000-8000-000000000021";
    const currentDate = Temporal.PlainDate.from("2026-07-21");
    const firstCompletedDate = currentDate.subtract({ days: 300 });
    await createHabit(habitId, "Long-running daily habit", firstCompletedDate.toString());
    const logDates = Array.from({ length: 300 }, (_, index) =>
      firstCompletedDate.add({ days: index }).toString(),
    );
    await database.insert(schema.habitLogs).values(
      logDates.map((localDate) => ({
        id: randomUUID(),
        userId: owner.userId,
        habitId,
        localDate,
        state: "completed",
        quantity: null,
        note: null,
        version: 1,
        createdAt: fixedInstant,
        updatedAt: fixedInstant,
      })),
    );

    await expect(application.projections.getHabitStreaks(owner, habitId)).resolves.toMatchObject({
      habitId,
      cadence: "day",
      current: 300,
      best: 300,
      evaluatedThrough: "2026-07-21",
    });
    const overview = await application.projections.getHabitOverview(owner, habitId);
    expect(overview.streak).toMatchObject({ current: 300, best: 300 });
    expect(overview.sevenDay).toHaveLength(7);
    expect(overview.sevenDay.slice(0, 6).every(({ status }) => status === "successful")).toBe(true);
    expect(overview.today.status).toBe("open");
  });
});

async function createHabit(id: string, title: string, startDate = "2026-07-01") {
  const input: CreateHabitRequest = {
    title,
    icon: "H",
    colorToken: "mint",
    goal: { goalKind: "boolean", targetValue: null, unit: null },
    schedule: {
      kind: "daily",
      weekdays: null,
      targetPerWeek: null,
      timezone: "UTC",
      startDate,
      endDate: null,
    },
  };
  await application.definitions.createHabit(owner, id, input);
}

async function collectIds(
  read: (cursor: string | null) => Promise<Readonly<{ ids: string[]; nextCursor: string | null }>>,
) {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await read(cursor);
    ids.push(...page.ids);
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}
