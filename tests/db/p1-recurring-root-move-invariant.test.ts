import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p1_recurring_root_move_invariant");
const now = new Date("2026-07-19T10:00:00.000Z");
const clock: Clock = { now: () => new Date(now) };
const definition = {
  preset: { kind: "daily" as const, interval: 1 },
  end: { kind: "never" as const },
};

let pool: Pool;
let database: Database;
let owner: AuthenticatedActor;
let stranger: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("P1 recurring-root move invariant", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    owner = { userId: await insertUser(pool, "p1-recurring-move-owner") };
    stranger = { userId: await insertUser(pool, "p1-recurring-move-stranger") };
    const inboxes = createInboxUseCases({ database, clock });
    await inboxes.ensureInbox(owner.userId);
    await inboxes.ensureInbox(stranger.userId);
    application = createTasksApplication({ database, clock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("keeps active and ended definitions at the root until ended-series schedule clear", async () => {
    const source = await createList("Recurrence source");
    const destination = await createList("Recurrence destination");
    const destinationSection = await createSection(destination.id, "Destination section");
    const sourceParent = await createRootTask(source.id, "Source parent");
    const destinationParent = await createRootTask(destination.id, "Destination parent");
    const recurringRoot = await createScheduledRoot(source.id, "Recurring root");

    const active = await application.recurrences.setRecurrence(owner, recurringRoot.id, {
      expectedVersion: 1,
      definition,
    });
    expect(active).toMatchObject({ task: { version: 2 }, recurrence: { lifecycle: "active" } });

    await expect(
      application.tasks.moveTask(stranger, recurringRoot.id, {
        expectedVersion: 2,
        listId: source.id,
        sectionId: null,
        parentTaskId: sourceParent.id,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.tasks.moveTask(owner, recurringRoot.id, {
        expectedVersion: 2,
        listId: source.id,
        sectionId: null,
        parentTaskId: sourceParent.id,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    expect(await storedAggregate(recurringRoot.id)).toMatchObject({
      list_id: source.id,
      parent_task_id: null,
      version: 2,
      has_recurrence: true,
      has_schedule: true,
    });

    await expect(
      application.tasks.moveTask(owner, recurringRoot.id, {
        expectedVersion: 2,
        listId: destination.id,
        sectionId: destinationSection.id,
        parentTaskId: null,
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({
      listId: destination.id,
      sectionId: destinationSection.id,
      parentTaskId: null,
      version: 3,
    });
    await expect(application.recurrences.getRecurrence(owner, recurringRoot.id)).resolves.toMatchObject({
      lifecycle: "active",
      taskVersion: 3,
    });

    const ended = await application.recurrences.endRecurrence(owner, recurringRoot.id, {
      expectedVersion: 3,
    });
    expect(ended).toMatchObject({ task: { version: 4 }, recurrence: { lifecycle: "ended" } });
    await expect(
      application.tasks.moveTask(owner, recurringRoot.id, {
        expectedVersion: 4,
        listId: destination.id,
        sectionId: null,
        parentTaskId: destinationParent.id,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 4 });
    expect(await storedAggregate(recurringRoot.id)).toMatchObject({
      list_id: destination.id,
      section_id: destinationSection.id,
      parent_task_id: null,
      version: 4,
      has_recurrence: true,
      has_schedule: true,
    });

    await expect(
      application.schedules.clearSchedule(owner, recurringRoot.id, { expectedVersion: 4 }),
    ).resolves.toMatchObject({ task: { version: 5 }, schedule: null });
    expect(await storedAggregate(recurringRoot.id)).toMatchObject({
      version: 5,
      has_recurrence: false,
      has_schedule: false,
    });
    await expect(
      application.tasks.moveTask(owner, recurringRoot.id, {
        expectedVersion: 5,
        listId: destination.id,
        sectionId: null,
        parentTaskId: destinationParent.id,
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({ parentTaskId: destinationParent.id, version: 6 });
  });

  it("serializes concurrent recurrence creation and subtask move without a mixed state", async () => {
    const list = await createList("Concurrent recurrence move");
    const parent = await createRootTask(list.id, "Concurrent parent");
    const candidate = await createScheduledRoot(list.id, "Concurrent candidate");

    const [recurrenceOutcome, moveOutcome] = await Promise.allSettled([
      application.recurrences.setRecurrence(owner, candidate.id, {
        expectedVersion: 1,
        definition,
      }),
      application.tasks.moveTask(owner, candidate.id, {
        expectedVersion: 1,
        listId: list.id,
        sectionId: null,
        parentTaskId: parent.id,
        placement: { kind: "end" },
      }),
    ]);

    expect([recurrenceOutcome, moveOutcome].filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const aggregate = await storedAggregate(candidate.id);
    expect(aggregate).toMatchObject({ version: 2, has_schedule: true });

    if (recurrenceOutcome.status === "fulfilled") {
      expect(recurrenceOutcome.value).toMatchObject({ task: { version: 2 } });
      expect(moveOutcome).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ code: "CONFLICT", currentVersion: 2 }),
      });
      expect(aggregate).toMatchObject({ parent_task_id: null, has_recurrence: true });
    } else {
      expect(moveOutcome).toMatchObject({
        status: "fulfilled",
        value: expect.objectContaining({ parentTaskId: parent.id, version: 2 }),
      });
      expect(recurrenceOutcome.reason).toMatchObject({ code: "CONFLICT", currentVersion: 2 });
      expect(aggregate).toMatchObject({ parent_task_id: parent.id, has_recurrence: false });
    }
  });
});

async function createList(name: string) {
  return (
    await application.lists.createRegularList(owner, randomUUID(), {
      name,
      colorToken: "slate",
      folderId: null,
      placement: { kind: "end" },
    })
  ).value;
}

async function createSection(listId: string, name: string) {
  return (
    await application.sections.createSection(owner, listId, randomUUID(), {
      name,
      placement: { kind: "end" },
    })
  ).value;
}

async function createRootTask(listId: string, title: string) {
  return (
    await application.tasks.createTask(owner, randomUUID(), {
      title,
      descriptionMd: "",
      priority: "none",
      listId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
    })
  ).value;
}

async function createScheduledRoot(listId: string, title: string) {
  return (
    await application.tasks.createTaskWithSchedule(owner, randomUUID(), {
      title,
      descriptionMd: "",
      priority: "none",
      listId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
      schedule: { kind: "all_day", startDate: "2026-07-22", endDate: "2026-07-23" },
    })
  ).value.task;
}

async function storedAggregate(taskId: string) {
  const result = await pool.query(
    `select task.list_id, task.section_id, task.parent_task_id, task.version,
            (recurrence.task_id is not null) as has_recurrence,
            (schedule.task_id is not null) as has_schedule
       from tasks task
       left join task_recurrences recurrence
         on recurrence.user_id = task.user_id and recurrence.task_id = task.id
       left join task_schedules schedule
         on schedule.user_id = task.user_id and schedule.task_id = task.id
      where task.user_id = $1 and task.id = $2`,
    [owner.userId, taskId],
  );
  return result.rows[0] ?? null;
}
