import { describe, expect, it } from "vitest";

import { userExportEnvelopeSchema, type UserExportEnvelope } from "./export-envelope-contract";
import { portableHabitsSectionSchema } from "./export-habits-contract";
import { findExportRelationshipErrors } from "./export-relationship-validation";

const userId = "11111111-1111-4111-8111-111111111111";
const habitId = "22222222-2222-4222-8222-222222222222";
const logId = "33333333-3333-4333-8333-333333333333";
const instant = "2026-07-20T02:00:00.000Z";

describe("portable habits export contract", () => {
  it("validates the versioned definition, schedule, and local-day log section", () => {
    const envelope = userExportEnvelopeSchema.parse(buildEnvelope());

    expect(envelope).toMatchObject({
      schemaVersion: 5,
      habits: {
        schemaVersion: 1,
        habits: [{ id: habitId, goalKind: "quantity", targetValue: 20, unit: "minutes" }],
        schedules: [{ habitId, kind: "weekly_target", targetPerWeek: 4 }],
        logs: [{ id: logId, habitId, localDate: "2026-07-20", quantity: 24.5 }],
      },
    });
    expect(findExportRelationshipErrors(envelope)).toEqual([]);
  });

  it("rejects mixed goals, schedule discriminants, precision overflow, and invalid local data", () => {
    const mixedGoal = buildEnvelope();
    mixedGoal.habits.habits[0]!.goalKind = "boolean";
    expect(portableHabitsSectionSchema.safeParse(mixedGoal.habits).success).toBe(false);

    const mixedSchedule = buildEnvelope();
    mixedSchedule.habits.schedules[0]!.weekdays = [1, 2];
    expect(portableHabitsSectionSchema.safeParse(mixedSchedule.habits).success).toBe(false);

    const unsortedWeekdays = buildEnvelope();
    unsortedWeekdays.habits.schedules[0] = {
      ...unsortedWeekdays.habits.schedules[0]!,
      kind: "weekdays",
      weekdays: [3, 1],
      targetPerWeek: null,
    };
    expect(portableHabitsSectionSchema.safeParse(unsortedWeekdays.habits).success).toBe(false);

    const excessPrecision = buildEnvelope();
    excessPrecision.habits.logs[0]!.quantity = 1.000_1;
    expect(portableHabitsSectionSchema.safeParse(excessPrecision.habits).success).toBe(false);

    const upperBoundPrecision = buildEnvelope();
    upperBoundPrecision.habits.habits[0]!.targetValue = 999_999_998.123_000_5;
    upperBoundPrecision.habits.logs[0]!.quantity = 999_999_998.123_000_5;
    expect(portableHabitsSectionSchema.safeParse(upperBoundPrecision.habits).success).toBe(false);

    const reversedDates = buildEnvelope();
    reversedDates.habits.schedules[0]!.endDate = "2026-06-30";
    expect(portableHabitsSectionSchema.safeParse(reversedDates.habits).success).toBe(false);

    const skippedQuantity = buildEnvelope();
    skippedQuantity.habits.logs[0]!.state = "skipped";
    expect(portableHabitsSectionSchema.safeParse(skippedQuantity.habits).success).toBe(false);
  });

  it("preserves old log facts across a goal edit without exporting derived success", () => {
    const envelope = buildEnvelope();
    envelope.habits.habits[0] = {
      ...envelope.habits.habits[0]!,
      goalKind: "boolean",
      targetValue: null,
      unit: null,
    };

    const parsed = userExportEnvelopeSchema.parse(envelope);
    expect(parsed.habits.logs[0]?.quantity).toBe(24.5);
    expect(Object.keys(parsed.habits.logs[0] ?? {})).not.toContain("successful");
    expect(findExportRelationshipErrors(parsed)).toEqual([]);
  });

  it("rejects missing, duplicate, and cross-habit relationships", () => {
    expectRelationshipError(
      (envelope) => envelope.habits.schedules.splice(0, 1),
      `Habit ${habitId} has no schedule.`,
    );
    expectRelationshipError((envelope) => {
      envelope.habits.schedules.push(structuredClone(envelope.habits.schedules[0]!));
    }, `Habit schedule ${habitId} is duplicated.`);
    expectRelationshipError((envelope) => {
      envelope.habits.logs[0]!.habitId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    }, `Habit log ${logId} references an unknown habit.`);
    expectRelationshipError((envelope) => {
      const duplicate = structuredClone(envelope.habits.logs[0]!);
      duplicate.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      envelope.habits.logs.push(duplicate);
    }, `Habit day ${habitId}:2026-07-20 is duplicated.`);
  });
});

function expectRelationshipError(mutate: (envelope: UserExportEnvelope) => void, expectedMessage: string) {
  const envelope = userExportEnvelopeSchema.parse(buildEnvelope());
  mutate(envelope);
  expect(findExportRelationshipErrors(envelope)).toContain(expectedMessage);
}

function buildEnvelope(): UserExportEnvelope {
  return {
    schemaVersion: 5,
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
        timezone: "Asia/Singapore",
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
      lists: [],
      sections: [],
      tasks: [],
      schedules: [],
      recurrenceDefinitions: [],
      occurrenceEvents: [],
      checklistItems: [],
      tags: [],
      taskTags: [],
    },
    habits: {
      schemaVersion: 1,
      habits: [
        {
          id: habitId,
          title: "Read deeply",
          icon: "📚",
          colorToken: "mint",
          goalKind: "quantity",
          targetValue: 20,
          unit: "minutes",
          version: 2,
          createdAt: instant,
          updatedAt: instant,
          archivedAt: null,
        },
      ],
      schedules: [
        {
          habitId,
          kind: "weekly_target",
          weekdays: null,
          targetPerWeek: 4,
          timezone: "Asia/Singapore",
          startDate: "2026-07-01",
          endDate: null,
          createdAt: instant,
          updatedAt: instant,
        },
      ],
      logs: [
        {
          id: logId,
          habitId,
          localDate: "2026-07-20",
          state: "completed",
          quantity: 24.5,
          note: "Quiet chapter",
          version: 1,
          createdAt: instant,
          updatedAt: instant,
        },
      ],
    },
    focus: { schemaVersion: 1, sessions: [] },
    notifications: { schemaVersion: 1, reminders: [] },
    assistant: { schemaVersion: 1, proposals: [] },
  };
}
