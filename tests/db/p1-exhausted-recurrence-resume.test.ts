import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import { createOccurrenceKey } from "../../modules/tasks/domain/recurrence/occurrence-key.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p1_exhausted_recurrence_resume");
let currentInstant = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(currentInstant) };

let pool: Pool;
let database: Database;
let owner: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("P1 exhausted recurrence resume cutover", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    owner = { userId: await insertUser(pool, "p1-exhausted-recurrence-owner") };
    await createInboxUseCases({ database, clock }).ensureInbox(owner.userId);
    application = createTasksApplication({
      database,
      clock,
      taskSchedules: schema.taskSchedules,
      resolveUserTimezone: async () => "Asia/Singapore",
    });
  });

  afterAll(async () => fixture.teardown());

  it("advances an exhausted all-day count rule after cancel and keeps its event undoable", async () => {
    currentInstant = new Date("2026-07-19T01:00:00.000Z");
    const task = await createScheduledTask("Count resume", {
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
    });
    await application.recurrences.setRecurrence(owner, task.id, {
      expectedVersion: 1,
      definition: {
        preset: { kind: "daily", interval: 1 },
        end: { kind: "count", count: 2 },
      },
    });
    const occurrenceKey = createOccurrenceKey(task.id, {
      kind: "all_day",
      startDate: "2026-07-20",
    });
    await application.occurrences.transitionOccurrence(owner, task.id, {
      action: "complete",
      occurrenceKey,
      expectedVersion: 2,
    });
    await application.tasks.transitionTaskStatus(owner, task.id, {
      expectedVersion: 3,
      status: "cancelled",
    });

    currentInstant = new Date("2026-07-25T10:00:00.000Z");
    await expect(
      application.tasks.transitionTaskStatus(owner, task.id, {
        expectedVersion: 4,
        status: "open",
      }),
    ).resolves.toMatchObject({ status: "open", version: 5 });
    await expect(application.recurrences.getRecurrence(owner, task.id)).resolves.toMatchObject({
      taskVersion: 5,
      lifecycle: "exhausted",
      cutover: {
        kind: "all_day",
        projectionStartDate: "2026-07-26",
        projectionEndDate: null,
      },
    });
    expect(await storedEvents(task.id)).toEqual([{ state: "completed", task_version: 3 }]);

    await expect(
      application.occurrences.transitionOccurrence(owner, task.id, {
        action: "undo",
        occurrenceKey,
        expectedVersion: 5,
      }),
    ).resolves.toMatchObject({ outcome: "applied", occurrenceState: "open", task: { version: 6 } });
    expect(await storedEvents(task.id)).toEqual([
      { state: "completed", task_version: 3 },
      { state: "open", task_version: 6 },
    ]);
  });

  it("advances an exhausted timed until rule after restore and keeps its event undoable", async () => {
    currentInstant = new Date("2026-07-19T01:00:00.000Z");
    const task = await createScheduledTask("Until restore", {
      kind: "timed",
      startAt: "2026-07-20T01:00:00.000Z",
      endAt: "2026-07-20T02:00:00.000Z",
      timezone: "UTC",
    });
    await application.recurrences.setRecurrence(owner, task.id, {
      expectedVersion: 1,
      definition: {
        preset: { kind: "daily", interval: 1 },
        end: { kind: "until", untilDate: "2026-07-21" },
      },
    });
    const occurrenceKey = createOccurrenceKey(task.id, {
      kind: "timed",
      startAt: "2026-07-20T01:00:00.000Z",
    });
    await application.occurrences.transitionOccurrence(owner, task.id, {
      action: "skip",
      occurrenceKey,
      expectedVersion: 2,
    });
    await application.tasks.deleteTask(owner, task.id, { expectedVersion: 3 });

    currentInstant = new Date("2026-07-25T12:34:56.000Z");
    await expect(
      application.tasks.restoreTask(owner, task.id, { expectedVersion: 4 }),
    ).resolves.toMatchObject({ deletedAt: null, version: 5 });
    await expect(application.recurrences.getRecurrence(owner, task.id)).resolves.toMatchObject({
      taskVersion: 5,
      lifecycle: "exhausted",
      cutover: {
        kind: "timed",
        projectionStartAt: "2026-07-25T12:34:56.000Z",
        projectionEndAt: null,
      },
    });
    expect(await storedEvents(task.id)).toEqual([{ state: "skipped", task_version: 3 }]);

    await expect(
      application.occurrences.transitionOccurrence(owner, task.id, {
        action: "undo",
        occurrenceKey,
        expectedVersion: 5,
      }),
    ).resolves.toMatchObject({ outcome: "applied", occurrenceState: "open", task: { version: 6 } });
    expect(await storedEvents(task.id)).toEqual([
      { state: "skipped", task_version: 3 },
      { state: "open", task_version: 6 },
    ]);
  });
});

type ScheduleInput =
  | Readonly<{ kind: "all_day"; startDate: string; endDate: string }>
  | Readonly<{ kind: "timed"; startAt: string; endAt: string; timezone: string }>;

async function createScheduledTask(title: string, schedule: ScheduleInput) {
  const list = (
    await application.lists.createRegularList(owner, randomUUID(), {
      name: `${title} list`,
      colorToken: "slate",
      folderId: null,
      placement: { kind: "end" },
    })
  ).value;
  return (
    await application.tasks.createTaskWithSchedule(owner, randomUUID(), {
      title,
      descriptionMd: "",
      priority: "none",
      listId: list.id,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
      schedule,
    })
  ).value.task;
}

async function storedEvents(taskId: string) {
  const result = await pool.query(
    `select state, task_version
       from task_occurrence_events
      where user_id = $1 and task_id = $2
      order by task_version`,
    [owner.userId, taskId],
  );
  return result.rows;
}
