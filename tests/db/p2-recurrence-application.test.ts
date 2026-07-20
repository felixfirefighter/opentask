import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type { BoundedTaskProjection } from "../../modules/tasks/application/contracts/occurrence-contract.ts";
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
