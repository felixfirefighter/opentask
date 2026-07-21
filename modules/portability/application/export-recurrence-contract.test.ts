import { describe, expect, it } from "vitest";

import {
  PORTABLE_SECTION_SCHEMA_VERSION,
  PORTABLE_HABITS_SECTION_SCHEMA_VERSION,
  PORTABLE_TASKS_SECTION_SCHEMA_VERSION,
  USER_EXPORT_SCHEMA_VERSION,
} from "./export-contract-primitives";
import { userExportEnvelopeSchema, type UserExportEnvelope } from "./export-envelope-contract";
import { findExportRelationshipErrors } from "./export-relationship-validation";
import { portableTasksSectionSchema } from "./export-tasks-contract";

const userId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const allDayTaskId = "33333333-3333-4333-8333-333333333333";
const timedTaskId = "44444444-4444-4444-8444-444444444444";
const childTaskId = "55555555-5555-4555-8555-555555555555";
const historicalTaskId = "66666666-6666-4666-8666-666666666666";
const unknownTaskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const instant = "2026-07-20T02:00:00.000Z";

describe("portable recurrence export contract", () => {
  it("preserves tasks version 2 inside the version 3 habits envelope", () => {
    const envelope = userExportEnvelopeSchema.parse(buildEnvelope());

    expect(USER_EXPORT_SCHEMA_VERSION).toBe(3);
    expect(PORTABLE_TASKS_SECTION_SCHEMA_VERSION).toBe(2);
    expect(PORTABLE_SECTION_SCHEMA_VERSION).toBe(1);
    expect(PORTABLE_HABITS_SECTION_SCHEMA_VERSION).toBe(1);
    expect(envelope).toMatchObject({
      schemaVersion: 3,
      identity: { schemaVersion: 1 },
      tasks: { schemaVersion: 2 },
      habits: { schemaVersion: 1 },
      assistant: { schemaVersion: 1 },
    });
    expect(findExportRelationshipErrors(envelope)).toEqual([]);
  });

  it("preserves typed cutovers and append-only transitions without requiring a current definition", () => {
    const envelope = userExportEnvelopeSchema.parse(buildEnvelope());
    const timedDefinition = recurrenceDefinition(envelope, timedTaskId);
    const repeatedKeyEvents = envelope.tasks.occurrenceEvents.filter(({ taskId }) => taskId === allDayTaskId);

    expect(timedDefinition).toMatchObject({
      kind: "timed",
      projectionStartAt: "2026-07-20T09:00:00.000Z",
      projectionEndAt: "2026-07-20T09:00:00.000Z",
    });
    expect(repeatedKeyEvents.map(({ state, taskVersion }) => ({ state, taskVersion }))).toEqual([
      { state: "completed", taskVersion: 2 },
      { state: "open", taskVersion: 3 },
    ]);
    expect(envelope.tasks.recurrenceDefinitions.some(({ taskId }) => taskId === historicalTaskId)).toBe(
      false,
    );
    expect(envelope.tasks.occurrenceEvents.some(({ taskId }) => taskId === historicalTaskId)).toBe(true);
  });

  it("rejects legacy versions, non-UTC instants, malformed rules, cutovers, and occurrence keys", () => {
    const envelope = buildEnvelope();
    expect(userExportEnvelopeSchema.safeParse({ ...envelope, schemaVersion: 1 }).success).toBe(false);
    expect(
      userExportEnvelopeSchema.safeParse({
        ...envelope,
        tasks: { ...envelope.tasks, schemaVersion: 1 },
      }).success,
    ).toBe(false);
    expect(
      userExportEnvelopeSchema.safeParse({
        ...envelope,
        exportedAt: "2026-07-20T10:00:00.000+08:00",
      }).success,
    ).toBe(false);

    const prefixedRule = buildEnvelope();
    recurrenceDefinition(prefixedRule, allDayTaskId).rrule = "RRULE:FREQ=DAILY";
    expect(portableTasksSectionSchema.safeParse(prefixedRule.tasks).success).toBe(false);

    const forbiddenAnchor = buildEnvelope();
    recurrenceDefinition(forbiddenAnchor, allDayTaskId).rrule = "FREQ=DAILY;DTSTART=20260720T020000Z";
    expect(portableTasksSectionSchema.safeParse(forbiddenAnchor.tasks).success).toBe(false);

    const duplicateProperty = buildEnvelope();
    recurrenceDefinition(duplicateProperty, allDayTaskId).rrule = "FREQ=DAILY;INTERVAL=1;INTERVAL=2";
    expect(portableTasksSectionSchema.safeParse(duplicateProperty.tasks).success).toBe(false);

    const reversedCutover = buildEnvelope();
    const allDayDefinition = recurrenceDefinition(reversedCutover, allDayTaskId);
    if (allDayDefinition.kind !== "all_day") throw new Error("Expected an all-day definition fixture.");
    allDayDefinition.projectionEndDate = "2026-07-19";
    expect(portableTasksSectionSchema.safeParse(reversedCutover.tasks).success).toBe(false);

    const unsupportedKey = buildEnvelope();
    unsupportedKey.tasks.occurrenceEvents[0]!.occurrenceKey = "o3.future-format";
    expect(portableTasksSectionSchema.safeParse(unsupportedKey.tasks).success).toBe(false);

    const malformedPayload = buildEnvelope();
    malformedPayload.tasks.occurrenceEvents[0]!.occurrenceKey = "o1.a";
    expect(portableTasksSectionSchema.safeParse(malformedPayload.tasks).success).toBe(false);
  });

  it("rejects missing, duplicate, incompatible, and ineligible recurrence relationships", () => {
    expectRelationshipError(
      (envelope) => envelope.tasks.schedules.splice(0, 1),
      `Recurrence definition for task ${allDayTaskId} has no compatible schedule.`,
    );
    expectRelationshipError((envelope) => {
      envelope.tasks.recurrenceDefinitions.push(
        structuredClone(recurrenceDefinition(envelope, allDayTaskId)),
      );
    }, `Recurrence definition ${allDayTaskId} is duplicated.`);
    expectRelationshipError((envelope) => {
      recurrenceDefinition(envelope, timedTaskId).timezone = "Asia/Singapore";
    }, `Recurrence definition for task ${timedTaskId} has an incompatible timezone.`);
    expectRelationshipError((envelope) => {
      const definition = recurrenceDefinition(envelope, allDayTaskId);
      if (definition.kind !== "all_day") throw new Error("Expected an all-day definition fixture.");
      definition.projectionStartDate = "2026-07-19";
    }, `Recurrence definition for task ${allDayTaskId} starts before its schedule anchor.`);
    expectRelationshipError((envelope) => {
      envelope.tasks.schedules.push({
        taskId: childTaskId,
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-21",
        createdAt: instant,
        updatedAt: instant,
      });
      envelope.tasks.recurrenceDefinitions.push({
        taskId: childTaskId,
        rrule: "FREQ=DAILY;INTERVAL=1",
        timezone: "UTC",
        generationMode: "schedule",
        kind: "all_day",
        projectionStartDate: "2026-07-20",
        projectionEndDate: null,
        createdAt: instant,
        updatedAt: instant,
      });
    }, `Recurrence definition references non-root task ${childTaskId}.`);
    expectRelationshipError((envelope) => {
      task(envelope, allDayTaskId).status = "completed";
    }, `Completed task ${allDayTaskId} has a recurrence definition without an upper cutover.`);
    expectRelationshipError((envelope) => {
      recurrenceDefinition(envelope, allDayTaskId).taskId = unknownTaskId;
    }, `Recurrence definition references unknown task ${unknownTaskId}.`);
  });

  it("rejects duplicate, future, unknown, and non-root occurrence event identities", () => {
    expectRelationshipError(
      (envelope) => {
        const duplicate = structuredClone(envelope.tasks.occurrenceEvents[0]!);
        duplicate.taskVersion = 4;
        envelope.tasks.occurrenceEvents.push(duplicate);
      },
      `Occurrence event ${envelopeEventId(0)} is duplicated.`,
    );
    expectRelationshipError((envelope) => {
      const duplicateVersion = structuredClone(envelope.tasks.occurrenceEvents[0]!);
      duplicateVersion.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      duplicateVersion.occurrenceKey = "o1.ZGlmZmVyZW50";
      envelope.tasks.occurrenceEvents.push(duplicateVersion);
    }, `Occurrence event version ${allDayTaskId}:2 is duplicated.`);
    expectRelationshipError(
      (envelope) => {
        envelope.tasks.occurrenceEvents[0]!.taskVersion = 5;
      },
      `Occurrence event ${envelopeEventId(0)} is newer than its owning task.`,
    );
    expectRelationshipError(
      (envelope) => {
        envelope.tasks.occurrenceEvents[0]!.taskId = unknownTaskId;
      },
      `Occurrence event ${envelopeEventId(0)} references an unknown task.`,
    );
    expectRelationshipError(
      (envelope) => {
        envelope.tasks.occurrenceEvents[0]!.taskId = childTaskId;
      },
      `Occurrence event ${envelopeEventId(0)} references a non-root task.`,
    );
  });
});

function expectRelationshipError(mutate: (envelope: UserExportEnvelope) => void, expectedMessage: string) {
  const envelope = buildEnvelope();
  mutate(envelope);
  const parsed = userExportEnvelopeSchema.parse(envelope);
  expect(findExportRelationshipErrors(parsed)).toContain(expectedMessage);
}

function recurrenceDefinition(envelope: UserExportEnvelope, taskId: string) {
  const definition = envelope.tasks.recurrenceDefinitions.find((candidate) => candidate.taskId === taskId);
  if (!definition) throw new Error(`Missing recurrence definition fixture for ${taskId}.`);
  return definition;
}

function task(envelope: UserExportEnvelope, taskId: string) {
  const record = envelope.tasks.tasks.find((candidate) => candidate.id === taskId);
  if (!record) throw new Error(`Missing task fixture for ${taskId}.`);
  return record;
}

function envelopeEventId(index: number) {
  return buildEnvelope().tasks.occurrenceEvents[index]!.id;
}

function buildEnvelope(): UserExportEnvelope {
  return {
    schemaVersion: 3,
    exportedAt: instant,
    identity: {
      schemaVersion: 1,
      profile: {
        id: userId,
        name: "Export owner",
        email: "owner@example.test",
        createdAt: instant,
        updatedAt: instant,
      },
      preferences: {
        schemaVersion: 1,
        version: 1,
        timezone: "UTC",
        weekStart: 1,
        hourCycle: "h23",
        theme: "system",
        reducedMotion: false,
        createdAt: instant,
        updatedAt: instant,
      },
    },
    tasks: {
      schemaVersion: 2,
      folders: [],
      lists: [
        {
          id: listId,
          folderId: null,
          name: "Inbox",
          colorToken: "slate",
          rank: "a0",
          kind: "inbox",
          version: 1,
          createdAt: instant,
          updatedAt: instant,
          deletedAt: null,
        },
      ],
      sections: [],
      tasks: [
        taskFixture(allDayTaskId, 4),
        taskFixture(timedTaskId, 3),
        taskFixture(childTaskId, 1, allDayTaskId),
        taskFixture(historicalTaskId, 2),
      ],
      schedules: [
        {
          taskId: allDayTaskId,
          kind: "all_day",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
          createdAt: instant,
          updatedAt: instant,
        },
        {
          taskId: timedTaskId,
          kind: "timed",
          startAt: "2026-07-20T09:00:00.000Z",
          endAt: "2026-07-20T10:00:00.000Z",
          timezone: "UTC",
          createdAt: instant,
          updatedAt: instant,
        },
      ],
      recurrenceDefinitions: [
        {
          taskId: allDayTaskId,
          rrule: "FREQ=DAILY;INTERVAL=1",
          timezone: "UTC",
          generationMode: "schedule",
          kind: "all_day",
          projectionStartDate: "2026-07-20",
          projectionEndDate: null,
          createdAt: instant,
          updatedAt: instant,
        },
        {
          taskId: timedTaskId,
          rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=5",
          timezone: "UTC",
          generationMode: "schedule",
          kind: "timed",
          projectionStartAt: "2026-07-20T09:00:00.000Z",
          projectionEndAt: "2026-07-20T09:00:00.000Z",
          createdAt: instant,
          updatedAt: instant,
        },
      ],
      occurrenceEvents: [
        occurrenceEvent(
          "77777777-7777-4777-8777-777777777777",
          allDayTaskId,
          2,
          "completed",
          "o1.YWxsLWRheQ",
        ),
        occurrenceEvent("88888888-8888-4888-8888-888888888888", allDayTaskId, 3, "open", "o1.YWxsLWRheQ"),
        occurrenceEvent("99999999-9999-4999-8999-999999999999", timedTaskId, 2, "skipped", "o1.dGltZWQ"),
        occurrenceEvent(
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          historicalTaskId,
          2,
          "completed",
          "o1.aGlzdG9yaWNhbA",
        ),
      ],
      checklistItems: [],
      tags: [],
      taskTags: [],
    },
    habits: { schemaVersion: 1, habits: [], schedules: [], logs: [] },
    assistant: { schemaVersion: 1, proposals: [] },
  };
}

function taskFixture(id: string, version: number, parentTaskId: string | null = null) {
  return {
    id,
    listId,
    sectionId: null,
    parentTaskId,
    title: `Task ${id.slice(0, 4)}`,
    descriptionMd: "",
    status: "open" as const,
    priority: "none" as const,
    rank: id,
    statusChangedAt: instant,
    version,
    createdAt: instant,
    updatedAt: instant,
    deletedAt: null,
  };
}

function occurrenceEvent(
  id: string,
  taskId: string,
  taskVersion: number,
  state: "completed" | "skipped" | "open",
  occurrenceKey: string,
) {
  return { id, taskId, occurrenceKey, state, taskVersion, effectiveAt: instant, createdAt: instant };
}
