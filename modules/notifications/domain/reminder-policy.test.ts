import { describe, expect, it } from "vitest";

import {
  assertReminderCanBeSet,
  reminderRelativeStartThreshold,
  resolveReminderTarget,
} from "./reminder-policy";

const now = new Date("2026-07-21T00:00:00.000Z");
const openOneOff = {
  status: "open" as const,
  deleted: false,
  recurring: false,
  relativeStart: null,
};

describe("reminder policy", () => {
  it("accepts an absolute instant only when it is strictly future", () => {
    const spec = { kind: "absolute" as const, remindAt: new Date(now.getTime() + 1), offsetMinutes: null };
    expect(resolveReminderTarget({ spec, enabled: true, task: openOneOff, now })).toEqual({
      kind: "eligible",
      scheduledFor: spec.remindAt,
      occurrenceKey: null,
    });
    expect(() =>
      assertReminderCanBeSet({
        spec: { ...spec, remindAt: now },
        enabled: true,
        task: openOneOff,
        now,
        allowDormantDisable: false,
      }),
    ).toThrow(/strictly after/);
  });

  it("derives a relative instant and advances the reader threshold by the offset", () => {
    const spec = { kind: "relative_start" as const, remindAt: null, offsetMinutes: 30 };
    const startAt = new Date("2026-07-21T01:00:00.000Z");
    expect(reminderRelativeStartThreshold(spec, now)).toEqual(new Date("2026-07-21T00:30:00.000Z"));
    expect(
      resolveReminderTarget({
        spec,
        enabled: true,
        task: { ...openOneOff, relativeStart: { startAt, occurrenceKey: null } },
        now,
      }),
    ).toEqual({
      kind: "eligible",
      scheduledFor: new Date("2026-07-21T00:30:00.000Z"),
      occurrenceKey: null,
    });
  });

  it("keeps lifecycle changes dormant without changing the enabled value", () => {
    expect(
      resolveReminderTarget({
        spec: { kind: "absolute", remindAt: new Date("2026-07-22T00:00:00.000Z"), offsetMinutes: null },
        enabled: true,
        task: { ...openOneOff, deleted: true },
        now,
      }),
    ).toEqual({ kind: "dormant", code: "task_deleted" });
  });

  it("rejects absolute semantics for a retained recurrence", () => {
    expect(() =>
      assertReminderCanBeSet({
        spec: { kind: "absolute", remindAt: new Date("2026-07-22T00:00:00.000Z"), offsetMinutes: null },
        enabled: true,
        task: { ...openOneOff, recurring: true },
        now,
        allowDormantDisable: false,
      }),
    ).toThrow(/recurring task/);
  });
});
