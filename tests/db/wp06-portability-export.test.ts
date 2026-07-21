import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildUserExportFilename,
  createPortabilityApplication,
  createPostgresExportSnapshot,
  userExportEnvelopeSchema,
  type UserExportEnvelope,
} from "../../modules/portability/index.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import {
  ALL_DAY_END_DATE,
  ALL_DAY_START_DATE,
  APIA_DATE_CROSSING_OCCURRENCE_KEY,
  EXPORT_INSTANT,
  PLANNING_DATE,
  PROPOSAL_APPLIED_INSTANT,
  PROPOSAL_EXPIRY_INSTANT,
  RECORD_INSTANT,
  portableEntityIds,
  seedPortableTenant,
} from "./support/export-test-data.ts";
import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("portability_export");
const exportClock: Clock = { now: () => new Date(EXPORT_INSTANT) };
const serverSecretCanary = "server-openai-key-must-not-leak";
let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let ownerASeed: Awaited<ReturnType<typeof seedPortableTenant>>;
let ownerBSeed: Awaited<ReturnType<typeof seedPortableTenant>>;

describe("portable PostgreSQL export", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: randomUUID() };
    ownerB = { userId: randomUUID() };
    ownerASeed = await seedPortableTenant(pool, {
      actor: ownerA,
      email: `alpha-${ownerA.userId}@example.test`,
      marker: "ALPHA_PRIVATE",
      timezone: "Asia/Singapore",
      timedStartInput: "2026-07-20T09:15:30.123+08:00",
      timedEndInput: "2026-07-20T10:45:30.123+08:00",
      timedStartUtc: "2026-07-20T01:15:30.123Z",
      timedEndUtc: "2026-07-20T02:45:30.123Z",
    });
    ownerBSeed = await seedPortableTenant(pool, {
      actor: ownerB,
      email: `beta-${ownerB.userId}@example.test`,
      marker: "BETA_PRIVATE",
      timezone: "America/New_York",
      timedStartInput: "2026-07-20T09:15:30.123-04:00",
      timedEndInput: "2026-07-20T10:45:30.123-04:00",
      timedStartUtc: "2026-07-20T13:15:30.123Z",
      timedEndUtc: "2026-07-20T14:45:30.123Z",
    });
  });

  afterAll(async () => fixture.teardown());

  it("exports one canonical relationship-safe document per actor with deterministic ordering", async () => {
    const application = createExporter();
    const firstA = await application.exportUserData(ownerA);
    const secondA = await application.exportUserData(ownerA);
    const exportB = await application.exportUserData(ownerB);

    expect(userExportEnvelopeSchema.parse(firstA)).toEqual(firstA);
    expect(firstA).toEqual(secondA);
    expect(firstA).toMatchObject({
      schemaVersion: 3,
      identity: { schemaVersion: 1 },
      tasks: { schemaVersion: 2 },
      habits: { schemaVersion: 1 },
      assistant: { schemaVersion: 1 },
    });
    expect(firstA.identity.profile).toMatchObject({
      id: ownerA.userId,
      name: ownerASeed.ownerName,
    });
    expect(exportB.identity.profile).toMatchObject({
      id: ownerB.userId,
      name: ownerBSeed.ownerName,
    });
    expect(JSON.stringify(firstA)).not.toContain("BETA_PRIVATE");
    expect(JSON.stringify(firstA)).not.toContain(ownerB.userId);
    expect(JSON.stringify(exportB)).not.toContain("ALPHA_PRIVATE");
    expect(JSON.stringify(exportB)).not.toContain(ownerA.userId);

    expect(firstA.tasks.folders.map(({ id }) => id)).toEqual([portableEntityIds.folder]);
    expect(firstA.tasks.lists.map(({ id }) => id)).toEqual([
      portableEntityIds.regularList,
      portableEntityIds.inboxList,
    ]);
    expect(firstA.tasks.sections.map(({ id }) => id)).toEqual([portableEntityIds.section]);
    expect(firstA.tasks.tasks.map(({ id }) => id)).toEqual([
      portableEntityIds.childTask,
      portableEntityIds.timedTask,
      portableEntityIds.allDayTask,
      portableEntityIds.rootTask,
    ]);
    expect(firstA.tasks.schedules.map(({ taskId }) => taskId)).toEqual([
      portableEntityIds.timedTask,
      portableEntityIds.allDayTask,
    ]);
    expect(firstA.tasks.recurrenceDefinitions.map(({ taskId }) => taskId)).toEqual([
      portableEntityIds.timedTask,
      portableEntityIds.allDayTask,
    ]);
    expect(firstA.tasks.occurrenceEvents.map(({ id }) => id)).toEqual([
      portableEntityIds.timedSkippedEvent,
      portableEntityIds.allDayCompletedEvent,
      portableEntityIds.allDayReopenedEvent,
    ]);
    expect(
      firstA.tasks.occurrenceEvents
        .filter(({ taskId }) => taskId === portableEntityIds.allDayTask)
        .map(({ occurrenceKey, state, taskVersion }) => ({ occurrenceKey, state, taskVersion })),
    ).toEqual([
      { occurrenceKey: "o1.YWxsLWRheQ", state: "completed", taskVersion: 2 },
      { occurrenceKey: "o1.YWxsLWRheQ", state: "open", taskVersion: 3 },
    ]);
    expect(
      firstA.tasks.occurrenceEvents.find(({ id }) => id === portableEntityIds.timedSkippedEvent),
    ).toMatchObject({
      taskId: portableEntityIds.timedTask,
      occurrenceKey: APIA_DATE_CROSSING_OCCURRENCE_KEY,
      state: "skipped",
      taskVersion: 2,
    });
    expect(APIA_DATE_CROSSING_OCCURRENCE_KEY).toMatch(/^o2\./);
    expect(firstA.tasks.tags.map(({ id }) => id)).toEqual([
      portableEntityIds.firstTag,
      portableEntityIds.secondTag,
    ]);
    expect(firstA.tasks.tags[1]?.deletedAt).toBe(RECORD_INSTANT);
    expect(firstA.tasks.taskTags).toEqual([
      { taskId: portableEntityIds.timedTask, tagId: portableEntityIds.firstTag },
      { taskId: portableEntityIds.rootTask, tagId: portableEntityIds.secondTag },
    ]);
    expect(firstA.habits.habits.map(({ id }) => id)).toEqual([
      portableEntityIds.booleanHabit,
      portableEntityIds.quantityHabit,
    ]);
    expect(firstA.habits.schedules.map(({ habitId }) => habitId)).toEqual([
      portableEntityIds.booleanHabit,
      portableEntityIds.quantityHabit,
    ]);
    expect(firstA.habits.logs.map(({ id }) => id)).toEqual([
      portableEntityIds.booleanHabitLog,
      portableEntityIds.quantityHabitLog,
    ]);
    expect(firstA.habits.habits[0]).toMatchObject({
      goalKind: "boolean",
      targetValue: null,
      unit: null,
      archivedAt: RECORD_INSTANT,
    });
    expect(firstA.habits.habits[1]).toMatchObject({
      goalKind: "quantity",
      targetValue: 20,
      unit: "minutes",
      archivedAt: null,
    });
    expect(firstA.habits.logs[1]).toMatchObject({
      habitId: portableEntityIds.quantityHabit,
      localDate: "2026-07-20",
      state: "completed",
      quantity: 24.5,
      note: "ALPHA_PRIVATE private habit note",
    });
    expect(firstA.assistant.proposals.map(({ id }) => id)).toEqual([
      portableEntityIds.firstProposal,
      portableEntityIds.secondProposal,
    ]);
    expect(exportB.tasks.tasks.map(({ id }) => id)).toEqual(firstA.tasks.tasks.map(({ id }) => id));
    expect(firstA.tasks.recurrenceDefinitions.find(({ kind }) => kind === "timed")?.timezone).toBe(
      "Asia/Singapore",
    );
    expect(exportB.tasks.recurrenceDefinitions.find(({ kind }) => kind === "timed")?.timezone).toBe(
      "America/New_York",
    );
    expect(exportB.assistant.proposals.map(({ id }) => id)).toEqual(
      firstA.assistant.proposals.map(({ id }) => id),
    );
    expect(exportB.habits.habits.map(({ id }) => id)).toEqual(firstA.habits.habits.map(({ id }) => id));
    expectRelationshipIntegrity(firstA);
    expectRelationshipIntegrity(exportB);
    await expect(application.exportUserData({ userId: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("omits authentication, apply, raw-input, provider, environment, and server secrets", async () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = serverSecretCanary;
    try {
      const before = await readMutationSentinels(ownerA.userId);
      const exported = await createExporter().exportUserData(ownerA);
      const after = await readMutationSentinels(ownerA.userId);
      const serialized = JSON.stringify(exported);

      expect(after).toEqual(before);
      expect(serialized).toContain("ALPHA_PRIVATE private root description");
      for (const secret of [
        ...ownerASeed.secretCanaries,
        ...ownerBSeed.secretCanaries,
        portableEntityIds.firstApplyToken,
        portableEntityIds.secondApplyToken,
        serverSecretCanary,
      ]) {
        expect(serialized).not.toContain(secret);
      }
      const exportedKeys = new Set(allKeys(exported));
      for (const forbiddenKey of [
        "accessToken",
        "account",
        "applyToken",
        "idempotencyKey",
        "password",
        "providerPayload",
        "rawBrainDump",
        "refreshToken",
        "serverConfiguration",
        "session",
        "token",
      ]) {
        expect(exportedKeys.has(forbiddenKey)).toBe(false);
      }
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it("preserves local dates, UTC instants, and explicit IANA timezone intent", async () => {
    const exported = await createExporter().exportUserData(ownerA);
    const allDay = exported.tasks.schedules.find(({ kind }) => kind === "all_day");
    const timed = exported.tasks.schedules.find(({ kind }) => kind === "timed");
    const allDayRecurrence = exported.tasks.recurrenceDefinitions.find(({ kind }) => kind === "all_day");
    const timedRecurrence = exported.tasks.recurrenceDefinitions.find(({ kind }) => kind === "timed");
    const applied = exported.assistant.proposals.find(({ status }) => status === "applied");
    const proposalSchedule = exported.assistant.proposals[0]?.proposal.actions[0];

    expect(exported.exportedAt).toBe(EXPORT_INSTANT);
    expect(exported.identity.preferences).toMatchObject({
      timezone: "Asia/Singapore",
      createdAt: RECORD_INSTANT,
      updatedAt: RECORD_INSTANT,
    });
    expect(exported.habits.schedules).toContainEqual({
      habitId: portableEntityIds.quantityHabit,
      kind: "weekly_target",
      weekdays: null,
      targetPerWeek: 4,
      timezone: "Asia/Singapore",
      startDate: "2026-07-01",
      endDate: null,
      createdAt: RECORD_INSTANT,
      updatedAt: RECORD_INSTANT,
    });
    expect(allDay).toEqual({
      taskId: portableEntityIds.allDayTask,
      kind: "all_day",
      startDate: ALL_DAY_START_DATE,
      endDate: ALL_DAY_END_DATE,
      createdAt: RECORD_INSTANT,
      updatedAt: RECORD_INSTANT,
    });
    expect(timed).toEqual({
      taskId: portableEntityIds.timedTask,
      kind: "timed",
      startAt: ownerASeed.timedStartUtc,
      endAt: ownerASeed.timedEndUtc,
      timezone: "Asia/Singapore",
      createdAt: RECORD_INSTANT,
      updatedAt: RECORD_INSTANT,
    });
    expect(allDayRecurrence).toEqual({
      taskId: portableEntityIds.allDayTask,
      rrule: "FREQ=DAILY;INTERVAL=1",
      timezone: "Asia/Singapore",
      generationMode: "schedule",
      kind: "all_day",
      projectionStartDate: ALL_DAY_START_DATE,
      projectionEndDate: null,
      createdAt: RECORD_INSTANT,
      updatedAt: RECORD_INSTANT,
    });
    expect(timedRecurrence).toEqual({
      taskId: portableEntityIds.timedTask,
      rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=5",
      timezone: "Asia/Singapore",
      generationMode: "schedule",
      kind: "timed",
      projectionStartAt: ownerASeed.timedStartUtc,
      projectionEndAt: ownerASeed.timedStartUtc,
      createdAt: RECORD_INSTANT,
      updatedAt: RECORD_INSTANT,
    });
    expect(applied).toMatchObject({
      planningDate: PLANNING_DATE,
      createdAt: RECORD_INSTANT,
      expiresAt: PROPOSAL_EXPIRY_INSTANT,
      appliedAt: PROPOSAL_APPLIED_INSTANT,
    });
    expect(proposalSchedule).toMatchObject({
      kind: "schedule",
      after: {
        kind: "timed",
        startAt: ownerASeed.timedStartUtc,
        endAt: ownerASeed.timedEndUtc,
        timeZone: "Asia/Singapore",
      },
    });
    for (const instant of allInstantValues(exported)) {
      expect(instant).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);
      expect(Number.isNaN(Date.parse(instant))).toBe(false);
    }
    expect(buildUserExportFilename(exported.exportedAt)).toBe("opentask-export-2026-07-20.json");
  });

  it("exposes no import, restore, parser, or mutation surface", async () => {
    const portabilityModule = await import("../../modules/portability/index.ts");
    expect(Object.keys(portabilityModule).sort()).toEqual([
      "PORTABLE_SECTION_SCHEMA_VERSION",
      "USER_EXPORT_SCHEMA_VERSION",
      "buildUserExportFilename",
      "createPortabilityApplication",
      "createPostgresExportSnapshot",
      "getPortabilityApplication",
      "userExportEnvelopeSchema",
    ]);
  });
});

function createExporter() {
  return createPortabilityApplication({
    snapshot: createPostgresExportSnapshot(database),
    clock: exportClock,
  });
}

async function readMutationSentinels(userId: string) {
  const [tasks, recurrences, occurrenceEvents, habits, habitSchedules, habitLogs, proposals, preferences] =
    await Promise.all([
      pool.query(`select id, title, version from tasks where user_id = $1 order by id`, [userId]),
      pool.query(
        `select task_id, rrule, projection_start_date, projection_start_at,
              projection_end_date, projection_end_at
         from task_recurrences where user_id = $1 order by task_id`,
        [userId],
      ),
      pool.query(
        `select id, task_id, occurrence_key, state, task_version
         from task_occurrence_events where user_id = $1 order by task_id, task_version`,
        [userId],
      ),
      pool.query(
        `select id, title, goal_kind, target_value, unit, version, archived_at
         from habits where user_id = $1 order by id`,
        [userId],
      ),
      pool.query(
        `select habit_id, kind, weekdays, target_per_week, timezone, start_date, end_date
         from habit_schedules where user_id = $1 order by habit_id`,
        [userId],
      ),
      pool.query(
        `select id, habit_id, local_date, state, quantity, note, version
         from habit_logs where user_id = $1 order by habit_id, local_date, id`,
        [userId],
      ),
      pool.query(`select id, status, idempotency_key from planner_proposals where user_id = $1 order by id`, [
        userId,
      ]),
      pool.query(`select version, preferences from user_preferences where user_id = $1`, [userId]),
    ]);
  return {
    tasks: tasks.rows,
    recurrences: recurrences.rows,
    occurrenceEvents: occurrenceEvents.rows,
    habits: habits.rows,
    habitSchedules: habitSchedules.rows,
    habitLogs: habitLogs.rows,
    proposals: proposals.rows,
    preferences: preferences.rows,
  };
}

function expectRelationshipIntegrity(envelope: UserExportEnvelope) {
  const folderIds = new Set(envelope.tasks.folders.map(({ id }) => id));
  const lists = new Map(envelope.tasks.lists.map((list) => [list.id, list]));
  const sections = new Map(envelope.tasks.sections.map((section) => [section.id, section]));
  const tasks = new Map(envelope.tasks.tasks.map((task) => [task.id, task]));
  const schedules = new Map(envelope.tasks.schedules.map((schedule) => [schedule.taskId, schedule]));
  const tagIds = new Set(envelope.tasks.tags.map(({ id }) => id));
  for (const list of envelope.tasks.lists) {
    expect(list.folderId === null || folderIds.has(list.folderId)).toBe(true);
  }
  for (const section of envelope.tasks.sections) expect(lists.has(section.listId)).toBe(true);
  for (const task of envelope.tasks.tasks) {
    expect(lists.has(task.listId)).toBe(true);
    if (task.sectionId !== null) expect(sections.get(task.sectionId)?.listId).toBe(task.listId);
    if (task.parentTaskId !== null) expect(tasks.get(task.parentTaskId)?.listId).toBe(task.listId);
  }
  for (const schedule of envelope.tasks.schedules) expect(tasks.has(schedule.taskId)).toBe(true);
  for (const recurrence of envelope.tasks.recurrenceDefinitions) {
    const owner = tasks.get(recurrence.taskId);
    const schedule = schedules.get(recurrence.taskId);
    expect(owner?.parentTaskId).toBeNull();
    expect(schedule?.kind).toBe(recurrence.kind);
    if (recurrence.kind === "timed" && schedule?.kind === "timed") {
      expect(recurrence.timezone).toBe(schedule.timezone);
    }
  }
  const eventVersions = new Set<string>();
  for (const event of envelope.tasks.occurrenceEvents) {
    const owner = tasks.get(event.taskId);
    expect(owner?.parentTaskId).toBeNull();
    expect(event.taskVersion).toBeLessThanOrEqual(owner?.version ?? 0);
    const versionKey = `${event.taskId}:${event.taskVersion}`;
    expect(eventVersions.has(versionKey)).toBe(false);
    eventVersions.add(versionKey);
  }
  for (const item of envelope.tasks.checklistItems) expect(tasks.has(item.taskId)).toBe(true);
  for (const link of envelope.tasks.taskTags) {
    expect(tasks.has(link.taskId)).toBe(true);
    expect(tagIds.has(link.tagId)).toBe(true);
  }
  for (const proposal of envelope.assistant.proposals) {
    for (const subject of proposal.proposal.subjects) {
      if (subject.taskId !== null) expect(tasks.has(subject.taskId)).toBe(true);
    }
  }
  const habits = new Set(envelope.habits.habits.map(({ id }) => id));
  const scheduledHabits = new Set<string>();
  for (const schedule of envelope.habits.schedules) {
    expect(habits.has(schedule.habitId)).toBe(true);
    expect(scheduledHabits.has(schedule.habitId)).toBe(false);
    scheduledHabits.add(schedule.habitId);
  }
  expect(scheduledHabits).toEqual(habits);
  const habitDays = new Set<string>();
  for (const log of envelope.habits.logs) {
    expect(habits.has(log.habitId)).toBe(true);
    const key = `${log.habitId}:${log.localDate}`;
    expect(habitDays.has(key)).toBe(false);
    habitDays.add(key);
  }
}

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
}

function allInstantValues(envelope: UserExportEnvelope): string[] {
  const values: string[] = [
    envelope.exportedAt,
    envelope.identity.profile.createdAt,
    envelope.identity.profile.updatedAt,
    envelope.identity.preferences.createdAt,
    envelope.identity.preferences.updatedAt,
  ];
  for (const row of [
    ...envelope.tasks.folders,
    ...envelope.tasks.lists,
    ...envelope.tasks.sections,
    ...envelope.tasks.tasks,
    ...envelope.tasks.checklistItems,
    ...envelope.tasks.tags,
  ]) {
    values.push(row.createdAt, row.updatedAt);
    if ("deletedAt" in row && row.deletedAt !== null) values.push(row.deletedAt);
    if ("statusChangedAt" in row) values.push(row.statusChangedAt);
  }
  for (const schedule of envelope.tasks.schedules) {
    values.push(schedule.createdAt, schedule.updatedAt);
    if (schedule.kind === "timed") values.push(schedule.startAt, schedule.endAt);
  }
  for (const recurrence of envelope.tasks.recurrenceDefinitions) {
    values.push(recurrence.createdAt, recurrence.updatedAt);
    if (recurrence.kind === "timed") {
      values.push(recurrence.projectionStartAt);
      if (recurrence.projectionEndAt !== null) values.push(recurrence.projectionEndAt);
    }
  }
  for (const event of envelope.tasks.occurrenceEvents) {
    values.push(event.effectiveAt, event.createdAt);
  }
  for (const habit of envelope.habits.habits) {
    values.push(habit.createdAt, habit.updatedAt);
    if (habit.archivedAt !== null) values.push(habit.archivedAt);
  }
  for (const schedule of envelope.habits.schedules) {
    values.push(schedule.createdAt, schedule.updatedAt);
  }
  for (const log of envelope.habits.logs) {
    values.push(log.createdAt, log.updatedAt);
  }
  for (const record of envelope.assistant.proposals) {
    values.push(record.createdAt, record.expiresAt);
    if (record.appliedAt !== null) values.push(record.appliedAt);
    for (const action of record.proposal.actions) {
      if (action.kind === "schedule" && action.after.kind === "timed") {
        values.push(action.after.startAt, action.after.endAt);
      }
      if (action.kind === "create" && action.after.schedule?.kind === "timed") {
        values.push(action.after.schedule.startAt, action.after.schedule.endAt);
      }
    }
  }
  return values;
}
