import { describe, expect, it } from "vitest";

import {
  normalizeReminderTaskIds,
  ReminderProducerPreparationRequiredError,
  taskRecurrenceReminderResolutionSchema,
} from "./task-reminder-contract";

const firstTaskId = "10000000-0000-4000-8000-000000000001";
const secondTaskId = "10000000-0000-4000-8000-000000000002";

describe("task reminder contracts", () => {
  it("accepts only explicit versioned recurrence reminder resolutions", () => {
    expect(
      taskRecurrenceReminderResolutionSchema.parse({
        kind: "convert_relative_start",
        expectedReminderVersion: 3,
        offsetMinutes: 10_080,
      }),
    ).toEqual({
      kind: "convert_relative_start",
      expectedReminderVersion: 3,
      offsetMinutes: 10_080,
    });
    expect(
      taskRecurrenceReminderResolutionSchema.safeParse({
        kind: "convert_relative_start",
        expectedReminderVersion: 3,
        offsetMinutes: 10_081,
      }).success,
    ).toBe(false);
    expect(
      taskRecurrenceReminderResolutionSchema.safeParse({
        kind: "remove",
        expectedReminderVersion: 0,
      }).success,
    ).toBe(false);
  });

  it("sorts and deduplicates canonical actor-owned task IDs on every seam", () => {
    expect(normalizeReminderTaskIds([secondTaskId, firstTaskId, secondTaskId])).toEqual([
      firstTaskId,
      secondTaskId,
    ]);
    expect(
      new ReminderProducerPreparationRequiredError([secondTaskId, firstTaskId, firstTaskId]).taskIds,
    ).toEqual([firstTaskId, secondTaskId]);
  });
});
