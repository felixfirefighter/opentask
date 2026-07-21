import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TaskScheduleValue } from "../../modules/tasks/application/contracts/index.ts";
import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_recurrence_schedule_kind_invariant");
const currentInstant = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(currentInstant) };
const range = {
  rangeStartDate: "2026-07-20",
  rangeEndDate: "2026-07-22",
  rangeStartAt: "2026-07-19T16:00:00.000Z",
  rangeEndAt: "2026-07-21T16:00:00.000Z",
  limit: 50,
} as const;
const definition = {
  preset: { kind: "daily" as const, interval: 1 },
  end: { kind: "never" as const },
};

let pool: Pool;
let database: Database;
let owner: AuthenticatedActor;
let stranger: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("P2 recurring schedule kind invariant", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    owner = { userId: await insertUser(pool, "recurrence-kind-owner") };
    stranger = { userId: await insertUser(pool, "recurrence-kind-stranger") };
    const inboxes = createInboxUseCases({ database, clock });
    await inboxes.ensureInbox(owner.userId);
    await inboxes.ensureInbox(stranger.userId);
    application = createTasksApplication({
      database,
      clock,
      taskSchedules: schema.taskSchedules,
      resolveUserTimezone: async () => "Asia/Singapore",
    });
  });

  afterAll(async () => fixture.teardown());

  it.each([
    {
      direction: "all-day to timed",
      original: {
        kind: "all_day" as const,
        startDate: "2026-07-20",
        endDate: "2026-07-21",
      },
      replacement: {
        kind: "timed" as const,
        startAt: "2026-07-20T01:00:00.000Z",
        endAt: "2026-07-20T02:00:00.000Z",
        timezone: "Asia/Singapore",
      },
    },
    {
      direction: "timed to all-day",
      original: {
        kind: "timed" as const,
        startAt: "2026-07-20T01:00:00.000Z",
        endAt: "2026-07-20T02:00:00.000Z",
        timezone: "Asia/Singapore",
      },
      replacement: {
        kind: "all_day" as const,
        startDate: "2026-07-20",
        endDate: "2026-07-21",
      },
    },
  ])("rejects $direction after a recorded occurrence without changing history", async (testCase) => {
    const list = (
      await application.lists.createRegularList(owner, randomUUID(), {
        name: `${testCase.direction} history`,
        colorToken: "slate",
        folderId: null,
        placement: { kind: "end" },
      })
    ).value;
    const taskId = randomUUID();
    await application.tasks.createTaskWithSchedule(owner, taskId, {
      title: `Protect ${testCase.direction}`,
      descriptionMd: "",
      priority: "none",
      listId: list.id,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
      schedule: testCase.original satisfies TaskScheduleValue,
    });
    await application.recurrences.setRecurrence(owner, taskId, {
      expectedVersion: 1,
      definition,
    });

    const before = await application.occurrences.readBoundedOccurrences(owner, range);
    const occurrence = before.items.find(
      (item) => item.projectionKind === "recurring" && item.task.id === taskId,
    );
    if (!occurrence || occurrence.projectionKind !== "recurring") {
      throw new Error(`Expected an occurrence for ${testCase.direction}.`);
    }
    await expect(
      application.occurrences.transitionOccurrence(owner, taskId, {
        action: "complete",
        occurrenceKey: occurrence.occurrence.occurrenceKey,
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({ outcome: "applied", task: { version: 3 } });

    const replacement = testCase.replacement satisfies TaskScheduleValue;
    await expect(
      application.recurrences.editRecurringSchedule(stranger, taskId, {
        expectedVersion: 3,
        definition,
        schedule: replacement,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.recurrences.editRecurringSchedule(owner, taskId, {
        expectedVersion: 2,
        definition,
        schedule: replacement,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 3 });
    await expect(
      application.recurrences.editRecurringSchedule(owner, taskId, {
        expectedVersion: 3,
        definition,
        schedule: replacement,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message:
        "A recurring schedule must keep its all-day or specific-time type to preserve occurrence history.",
    });

    await expect(application.schedules.getSchedule(owner, taskId)).resolves.toMatchObject({
      kind: testCase.original.kind,
    });
    await expect(application.recurrences.getRecurrence(owner, taskId)).resolves.toMatchObject({
      taskVersion: 3,
      cutover: { kind: testCase.original.kind },
    });

    const after = await application.occurrences.readBoundedOccurrences(owner, range);
    expect(
      after.items.find(
        (item) =>
          item.projectionKind === "recurring" &&
          item.task.id === taskId &&
          item.occurrence.occurrenceKey === occurrence.occurrence.occurrenceKey,
      ),
    ).toMatchObject({
      projectionKind: "recurring",
      task: { id: taskId, version: 3 },
      occurrence: {
        occurrenceKey: occurrence.occurrence.occurrenceKey,
        occurrenceState: "completed",
        schedule: { kind: testCase.original.kind },
      },
    });
    await expect(storedAggregateState(taskId)).resolves.toEqual({
      taskVersion: 3,
      scheduleKind: testCase.original.kind,
      eventCount: 1,
      eventVersions: [3],
    });
  });
});

async function storedAggregateState(taskId: string) {
  const aggregate = await pool.query<{ task_version: number; schedule_kind: string }>(
    `select tasks.version as task_version, task_schedules.kind as schedule_kind
       from tasks
       join task_schedules
         on task_schedules.user_id = tasks.user_id
        and task_schedules.task_id = tasks.id
      where tasks.user_id = $1 and tasks.id = $2`,
    [owner.userId, taskId],
  );
  const events = await pool.query<{ task_version: number }>(
    `select task_version
       from task_occurrence_events
      where user_id = $1 and task_id = $2
      order by task_version`,
    [owner.userId, taskId],
  );
  const row = aggregate.rows[0];
  if (!row) throw new Error("Expected the recurring aggregate to exist.");
  return {
    taskVersion: row.task_version,
    scheduleKind: row.schedule_kind,
    eventCount: events.rowCount,
    eventVersions: events.rows.map(({ task_version }) => task_version),
  };
}
