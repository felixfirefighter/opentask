import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type { BoundedTaskProjection } from "../../modules/tasks/application/contracts/occurrence-contract.ts";
import {
  createOccurrenceKey,
  createProjectedOccurrenceKey,
} from "../../modules/tasks/domain/recurrence/occurrence-key.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_recurrence_application");
const currentInstant = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(currentInstant) };
const recurrenceRange = {
  rangeStartDate: "2026-07-20",
  rangeEndDate: "2026-07-24",
  rangeStartAt: "2026-07-19T16:00:00.000Z",
  rangeEndAt: "2026-07-23T16:00:00.000Z",
  limit: 50,
} as const;

let pool: Pool;
let database: Database;
let owner: AuthenticatedActor;
let stranger: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("P2 recurrence application PostgreSQL golden path", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    owner = { userId: await insertUser(pool, "p2-recurrence-owner") };
    stranger = { userId: await insertUser(pool, "p2-recurrence-stranger") };
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

  it("creates, projects, transitions, edits, and ends one owned series without cloning tasks", async () => {
    const list = (
      await application.lists.createRegularList(owner, randomUUID(), {
        name: "Recurring work",
        colorToken: "violet",
        folderId: null,
        placement: { kind: "end" },
      })
    ).value;
    const taskId = randomUUID();
    const created = await application.tasks.createTaskWithSchedule(owner, taskId, {
      title: "Review priorities",
      descriptionMd: "",
      priority: "high",
      listId: list.id,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
      schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
    });
    expect(created.value.task.version).toBe(1);

    await expect(
      application.recurrences.setRecurrence(stranger, taskId, {
        expectedVersion: 1,
        definition: dailyDefinition(1),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const recurrence = await application.recurrences.setRecurrence(owner, taskId, {
      expectedVersion: 1,
      definition: dailyDefinition(1),
    });
    expect(recurrence).toMatchObject({
      task: { id: taskId, version: 2 },
      recurrence: {
        taskId,
        taskVersion: 2,
        timezone: "Asia/Singapore",
        lifecycle: "active",
        cutover: {
          kind: "all_day",
          projectionStartDate: "2026-07-20",
          projectionEndDate: null,
        },
      },
    });
    await expect(application.recurrences.getRecurrence(stranger, taskId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const initialPage = await application.occurrences.readBoundedOccurrences(owner, recurrenceRange);
    expect(initialPage.truncation.truncated).toBe(false);
    expect(recurringDates(initialPage.items)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
    ]);
    const july21 = recurringOccurrence(initialPage.items, "2026-07-21");
    const july22 = recurringOccurrence(initialPage.items, "2026-07-22");

    await expect(
      application.occurrences.readOccurrence(owner, taskId, july21.occurrence.occurrenceKey),
    ).resolves.toMatchObject({
      taskId,
      taskVersion: 2,
      occurrenceKey: july21.occurrence.occurrenceKey,
      occurrenceState: "open",
      transitionEligible: true,
      schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
    });
    await expect(
      application.occurrences.readOccurrence(stranger, taskId, july21.occurrence.occurrenceKey),
    ).resolves.toBeNull();

    const completed = await application.occurrences.transitionOccurrence(owner, taskId, {
      action: "complete",
      occurrenceKey: july21.occurrence.occurrenceKey,
      expectedVersion: 2,
    });
    expect(completed).toMatchObject({
      outcome: "applied",
      occurrenceState: "completed",
      task: { id: taskId, version: 3 },
      eventTaskVersion: 3,
    });
    await expect(
      application.occurrences.transitionOccurrence(owner, taskId, {
        action: "complete",
        occurrenceKey: july21.occurrence.occurrenceKey,
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({ outcome: "idempotent_retry", eventTaskVersion: 3 });
    await expect(
      application.occurrences.transitionOccurrence(stranger, taskId, {
        action: "skip",
        occurrenceKey: july22.occurrence.occurrenceKey,
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await application.occurrences.transitionOccurrence(owner, taskId, {
      action: "skip",
      occurrenceKey: july22.occurrence.occurrenceKey,
      expectedVersion: 3,
    });
    await application.occurrences.transitionOccurrence(owner, taskId, {
      action: "undo",
      occurrenceKey: july21.occurrence.occurrenceKey,
      expectedVersion: 4,
    });
    const transitionedPage = await application.occurrences.readBoundedOccurrences(owner, recurrenceRange);
    expect(recurringOccurrence(transitionedPage.items, "2026-07-21").occurrence.occurrenceState).toBe("open");
    expect(recurringOccurrence(transitionedPage.items, "2026-07-22").occurrence.occurrenceState).toBe(
      "skipped",
    );

    const edited = await application.recurrences.editRecurringSchedule(owner, taskId, {
      expectedVersion: 5,
      definition: dailyDefinition(2),
      schedule: { kind: "all_day", startDate: "2026-07-22", endDate: "2026-07-23" },
    });
    expect(edited).toMatchObject({
      task: { version: 6 },
      recurrence: {
        definition: { preset: { kind: "daily", interval: 2 } },
        cutover: { kind: "all_day", projectionStartDate: "2026-07-22", projectionEndDate: null },
      },
    });

    const ended = await application.recurrences.endRecurrence(owner, taskId, { expectedVersion: 6 });
    expect(ended).toMatchObject({
      task: { version: 7 },
      recurrence: {
        lifecycle: "ended",
        cutover: { kind: "all_day", projectionStartDate: "2026-07-22", projectionEndDate: "2026-07-22" },
      },
    });
    await expect(
      application.tasks.transitionTaskStatus(owner, taskId, {
        expectedVersion: 7,
        status: "completed",
      }),
    ).resolves.toMatchObject({ status: "completed", version: 8 });

    const counts = await pool.query(
      `select
         (select count(*)::int from tasks where user_id = $1 and id = $2) as tasks,
         (select count(*)::int from task_recurrences where user_id = $1 and task_id = $2) as rules,
         (select count(*)::int from task_occurrence_events where user_id = $1 and task_id = $2) as events`,
      [owner.userId, taskId],
    );
    expect(counts.rows).toEqual([{ tasks: 1, rules: 1, events: 3 }]);
  });

  it("recovers and undoes recorded history after a rule edit advances the lower cutover", async () => {
    const taskId = await createAllDaySeries("Rule-edit history", "2026-07-18", "2026-07-19");
    const occurrenceKey = createOccurrenceKey(taskId, {
      kind: "all_day",
      startDate: "2026-07-18",
    });
    await expect(
      application.occurrences.transitionOccurrence(owner, taskId, {
        action: "complete",
        occurrenceKey,
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({ outcome: "applied", task: { version: 3 } });

    await expect(
      application.recurrences.setRecurrence(owner, taskId, {
        expectedVersion: 3,
        definition: dailyDefinition(2),
      }),
    ).resolves.toMatchObject({
      task: { version: 4 },
      recurrence: {
        cutover: { kind: "all_day", projectionStartDate: "2026-07-20" },
      },
    });

    const pastRange = {
      rangeStartDate: "2026-07-18",
      rangeEndDate: "2026-07-19",
      rangeStartAt: "2026-07-17T16:00:00.000Z",
      rangeEndAt: "2026-07-18T16:00:00.000Z",
      limit: 50,
    } as const;
    const recorded = await application.occurrences.readBoundedOccurrences(owner, pastRange);
    expect(recorded.items).toHaveLength(1);
    expect(recorded.items[0]).toMatchObject({
      projectionKind: "recurring",
      task: { id: taskId, version: 4 },
      occurrence: {
        occurrenceKey,
        occurrenceState: "completed",
        transitionEligible: false,
      },
    });
    await expect(application.occurrences.readOccurrence(owner, taskId, occurrenceKey)).resolves.toMatchObject(
      {
        taskId,
        taskVersion: 4,
        occurrenceKey,
        occurrenceState: "completed",
        transitionEligible: false,
        schedule: { kind: "all_day", startDate: "2026-07-18", endDate: "2026-07-19" },
      },
    );
    await expect(application.occurrences.readOccurrence(stranger, taskId, occurrenceKey)).resolves.toBeNull();
    await expect(application.occurrences.readBoundedOccurrences(stranger, pastRange)).resolves.toMatchObject({
      items: [],
    });

    await expect(
      application.occurrences.transitionOccurrence(owner, taskId, {
        action: "undo",
        occurrenceKey,
        expectedVersion: 4,
      }),
    ).resolves.toMatchObject({ outcome: "applied", occurrenceState: "open", task: { version: 5 } });
    const undone = await application.occurrences.readBoundedOccurrences(owner, pastRange);
    expect(undone.items).toHaveLength(1);
    expect(undone.items[0]).toMatchObject({
      occurrence: {
        occurrenceKey,
        occurrenceState: "open",
        transitionEligible: false,
      },
    });

    const events = await pool.query<{ task_version: number }>(
      `select task_version
         from task_occurrence_events
        where user_id = $1 and task_id = $2 and occurrence_key = $3
        order by task_version`,
      [owner.userId, taskId, occurrenceKey],
    );
    expect(events.rows.map(({ task_version }) => task_version)).toEqual([3, 5]);
  });

  it("includes only the final overlapping occurrence of ended 31-day all-day and timed series", async () => {
    const allDayTaskId = await createAllDaySeries("Long all-day series", "2026-07-18", "2026-08-18");
    const allDayFinalKey = createOccurrenceKey(allDayTaskId, {
      kind: "all_day",
      startDate: "2026-07-19",
    });
    await application.occurrences.transitionOccurrence(owner, allDayTaskId, {
      action: "complete",
      occurrenceKey: allDayFinalKey,
      expectedVersion: 2,
    });
    await expect(
      application.recurrences.endRecurrence(owner, allDayTaskId, { expectedVersion: 3 }),
    ).resolves.toMatchObject({
      task: { version: 4 },
      recurrence: {
        lifecycle: "ended",
        cutover: { kind: "all_day", projectionEndDate: "2026-07-20" },
      },
    });

    const timedTaskId = await createTimedSeries(
      "Long timed series",
      "2026-07-18T01:00:00.000Z",
      "2026-08-18T01:00:00.000Z",
    );
    await expect(
      application.recurrences.endRecurrence(owner, timedTaskId, { expectedVersion: 2 }),
    ).resolves.toMatchObject({
      task: { version: 3 },
      recurrence: {
        lifecycle: "ended",
        cutover: { kind: "timed", projectionEndAt: "2026-07-20T01:00:00.000Z" },
      },
    });

    const lateRange = {
      rangeStartDate: "2026-08-18",
      rangeEndDate: "2026-08-19",
      rangeStartAt: "2026-08-18T01:00:00.000Z",
      rangeEndAt: "2026-08-19T01:00:00.000Z",
      limit: 50,
    } as const;
    const page = await application.occurrences.readBoundedOccurrences(owner, lateRange);
    expect(page.truncation.truncated).toBe(false);
    expect(page.items).toHaveLength(2);
    expect(page.items.map(({ task }) => task.id)).toEqual([allDayTaskId, timedTaskId]);
    expect(new Set(page.items.map((item) => recurringKey(item))).size).toBe(2);
    expect(page.items[0]).toMatchObject({
      projectionKind: "recurring",
      occurrence: {
        occurrenceKey: allDayFinalKey,
        occurrenceState: "completed",
        schedule: { kind: "all_day", startDate: "2026-07-19", endDate: "2026-08-19" },
      },
    });
    expect(page.items[1]).toMatchObject({
      projectionKind: "recurring",
      occurrence: {
        occurrenceState: "open",
        schedule: {
          kind: "timed",
          startAt: "2026-07-19T01:00:00Z",
          endAt: "2026-08-19T01:00:00Z",
        },
      },
    });
    await expect(application.occurrences.readBoundedOccurrences(stranger, lateRange)).resolves.toMatchObject({
      items: [],
    });

    const adjacentRange = {
      ...lateRange,
      rangeStartDate: "2026-08-19",
      rangeEndDate: "2026-08-20",
      rangeStartAt: "2026-08-19T01:00:00.000Z",
      rangeEndAt: "2026-08-20T01:00:00.000Z",
    } as const;
    const adjacentPage = await application.occurrences.readBoundedOccurrences(owner, adjacentRange);
    expect(
      adjacentPage.items.filter(({ task }) => task.id === allDayTaskId || task.id === timedTaskId),
    ).toEqual([]);
  });

  it("reads a date-crossing o2 occurrence only for its owner", async () => {
    const list = (
      await application.lists.createRegularList(owner, randomUUID(), {
        name: "Date gap series list",
        colorToken: "slate",
        folderId: null,
        placement: { kind: "end" },
      })
    ).value;
    const taskId = randomUUID();
    await application.tasks.createTaskWithSchedule(owner, taskId, {
      title: "Date gap series",
      descriptionMd: "",
      priority: "none",
      listId: list.id,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
      schedule: {
        kind: "timed",
        startAt: "2011-12-29T19:00:00.000Z",
        endAt: "2011-12-29T20:00:00.000Z",
        timezone: "Pacific/Apia",
      },
    });
    await application.recurrences.setRecurrence(owner, taskId, {
      expectedVersion: 1,
      definition: dailyDefinition(1),
    });
    const occurrenceKey = createProjectedOccurrenceKey(
      taskId,
      { kind: "timed", startAt: "2011-12-30T19:00:00Z" },
      { kind: "timed", startLocalDateTime: "2011-12-30T09:00" },
      "Pacific/Apia",
    );
    expect(occurrenceKey).toMatch(/^o2\./);

    await expect(application.occurrences.readOccurrence(owner, taskId, occurrenceKey)).resolves.toEqual({
      taskId,
      taskVersion: 2,
      occurrenceKey,
      occurrenceState: "open",
      transitionEligible: true,
      schedule: {
        kind: "timed",
        startAt: "2011-12-30T19:00:00Z",
        endAt: "2011-12-30T20:00:00Z",
        timezone: "Pacific/Apia",
      },
    });
    await expect(application.occurrences.readOccurrence(stranger, taskId, occurrenceKey)).resolves.toBeNull();
  });

  it("serializes concurrent same-key retries without appending duplicate state", async () => {
    const taskId = await createAllDaySeries("Concurrent retry", "2026-07-20", "2026-07-21");
    const occurrenceKey = createOccurrenceKey(taskId, {
      kind: "all_day",
      startDate: "2026-07-20",
    });
    const request = { action: "complete" as const, occurrenceKey, expectedVersion: 2 };

    const results = await Promise.all([
      application.occurrences.transitionOccurrence(owner, taskId, request),
      application.occurrences.transitionOccurrence(owner, taskId, request),
    ]);

    expect(results.map(({ outcome }) => outcome).sort()).toEqual(["applied", "idempotent_retry"]);
    expect(results.every(({ task }) => task.version === 3)).toBe(true);
    expect(await storedOccurrenceVersions(taskId, occurrenceKey)).toEqual([3]);
    expect(await storedTaskVersion(taskId)).toBe(3);
  });

  it("allows one winner and one conflict for concurrent different-state commands", async () => {
    const taskId = await createAllDaySeries("Concurrent conflict", "2026-07-20", "2026-07-21");
    const occurrenceKey = createOccurrenceKey(taskId, {
      kind: "all_day",
      startDate: "2026-07-20",
    });

    const results = await Promise.allSettled([
      application.occurrences.transitionOccurrence(owner, taskId, {
        action: "complete",
        occurrenceKey,
        expectedVersion: 2,
      }),
      application.occurrences.transitionOccurrence(owner, taskId, {
        action: "skip",
        occurrenceKey,
        expectedVersion: 2,
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]?.value).toMatchObject({ outcome: "applied", task: { version: 3 } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: "CONFLICT", currentVersion: 3 });
    expect(await storedOccurrenceVersions(taskId, occurrenceKey)).toEqual([3]);
    expect(await storedTaskVersion(taskId)).toBe(3);
  });
});

function dailyDefinition(interval: number) {
  return { preset: { kind: "daily" as const, interval }, end: { kind: "never" as const } };
}

function recurringOccurrence(items: readonly BoundedTaskProjection[], startDate: string) {
  const item = items.find(
    (candidate) =>
      candidate.projectionKind === "recurring" &&
      candidate.occurrence.schedule.kind === "all_day" &&
      candidate.occurrence.schedule.startDate === startDate,
  );
  if (!item || item.projectionKind !== "recurring") {
    throw new Error(`Missing recurring occurrence for ${startDate}.`);
  }
  return item;
}

function recurringDates(items: readonly BoundedTaskProjection[]): string[] {
  return items.flatMap((item) =>
    item.projectionKind === "recurring" && item.occurrence.schedule.kind === "all_day"
      ? [item.occurrence.schedule.startDate]
      : [],
  );
}

function recurringKey(item: BoundedTaskProjection): string {
  if (item.projectionKind !== "recurring") throw new Error("Expected a recurring projection.");
  return item.occurrence.occurrenceKey;
}

async function createAllDaySeries(title: string, startDate: string, endDate: string): Promise<string> {
  const list = (
    await application.lists.createRegularList(owner, randomUUID(), {
      name: `${title} list`,
      colorToken: "slate",
      folderId: null,
      placement: { kind: "end" },
    })
  ).value;
  const taskId = randomUUID();
  await application.tasks.createTaskWithSchedule(owner, taskId, {
    title,
    descriptionMd: "",
    priority: "none",
    listId: list.id,
    sectionId: null,
    parentTaskId: null,
    placement: { kind: "end" },
    schedule: { kind: "all_day", startDate, endDate },
  });
  await application.recurrences.setRecurrence(owner, taskId, {
    expectedVersion: 1,
    definition: dailyDefinition(1),
  });
  return taskId;
}

async function createTimedSeries(title: string, startAt: string, endAt: string): Promise<string> {
  const list = (
    await application.lists.createRegularList(owner, randomUUID(), {
      name: `${title} list`,
      colorToken: "slate",
      folderId: null,
      placement: { kind: "end" },
    })
  ).value;
  const taskId = randomUUID();
  await application.tasks.createTaskWithSchedule(owner, taskId, {
    title,
    descriptionMd: "",
    priority: "none",
    listId: list.id,
    sectionId: null,
    parentTaskId: null,
    placement: { kind: "end" },
    schedule: { kind: "timed", startAt, endAt, timezone: "UTC" },
  });
  await application.recurrences.setRecurrence(owner, taskId, {
    expectedVersion: 1,
    definition: dailyDefinition(1),
  });
  return taskId;
}

async function storedOccurrenceVersions(taskId: string, occurrenceKey: string): Promise<number[]> {
  const result = await pool.query<{ task_version: number }>(
    `select task_version
       from task_occurrence_events
      where user_id = $1 and task_id = $2 and occurrence_key = $3
      order by task_version`,
    [owner.userId, taskId, occurrenceKey],
  );
  return result.rows.map(({ task_version }) => task_version);
}

async function storedTaskVersion(taskId: string): Promise<number> {
  const result = await pool.query<{ version: number }>(
    `select version from tasks where user_id = $1 and id = $2`,
    [owner.userId, taskId],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new Error("Expected the recurring task to exist.");
  return version;
}
