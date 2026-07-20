import { describe, expect, it } from "vitest";

import type { CalendarProjection } from "../application/public";
import { applyCalendarOccurrenceWrites, recordCalendarOccurrenceWrite } from "./planning-occurrence-optimism";

const taskId = "10000000-0000-4000-8000-000000000001";

describe("calendar occurrence optimism", () => {
  it("updates the selected state and advances every projection of the same task", () => {
    const writes = recordCalendarOccurrenceWrite({}, result(4, "open"));
    const updated = applyCalendarOccurrenceWrites(projection(3), writes);

    expect(updated.events).toEqual([
      expect.objectContaining({ occurrenceKey: "occurrence-one", occurrenceState: "open", version: 4 }),
      expect.objectContaining({ occurrenceKey: "occurrence-two", occurrenceState: "open", version: 4 }),
    ]);
  });

  it("never overwrites a newer authoritative occurrence", () => {
    const writes = recordCalendarOccurrenceWrite({}, result(4, "open"));
    const updated = applyCalendarOccurrenceWrites(projection(5), writes);

    expect(updated.events[0]).toMatchObject({ occurrenceState: "completed", version: 5 });
  });

  it("does not project an ahead idempotent retry across intervening task changes", () => {
    const current = recordCalendarOccurrenceWrite({}, result(4, "open"));
    const writes = recordCalendarOccurrenceWrite(current, {
      ...result(6, "skipped"),
      outcome: "idempotent_retry",
      expectedVersion: 3,
      eventTaskVersion: 4,
    });

    expect(writes).toBe(current);
    expect(applyCalendarOccurrenceWrites(projection(5), writes).events[0]).toMatchObject({
      occurrenceState: "completed",
      version: 5,
    });
  });
});

function result(taskVersion: number, occurrenceState: "open" | "completed" | "skipped") {
  return {
    outcome: "applied" as const,
    action: "undo" as const,
    occurrenceKey: "occurrence-one",
    expectedVersion: taskVersion - 1,
    task: { id: taskId, version: taskVersion },
    occurrenceState,
    eventTaskVersion: taskVersion,
  };
}

function projection(version: number): CalendarProjection {
  return {
    rangeStartDate: "2026-07-20",
    rangeEndDate: "2026-07-22",
    rangeStartAt: "2026-07-20T00:00:00.000Z",
    rangeEndAt: "2026-07-22T00:00:00.000Z",
    timeZone: "UTC",
    events: [event("occurrence-one", "completed", version), event("occurrence-two", "open", version)],
    truncated: false,
    truncationReasons: [],
  };
}

function event(
  occurrenceKey: string,
  occurrenceState: "open" | "completed" | "skipped",
  version: number,
): CalendarProjection["events"][number] {
  return {
    projectionId: `occurrence:${taskId}:${occurrenceKey}`,
    taskId,
    title: "Review progress",
    status: "open",
    priority: "none",
    listId: "20000000-0000-4000-8000-000000000001",
    version,
    kind: "all_day",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    projectionLifecycle: "recurring_occurrence",
    occurrenceKey,
    occurrenceState,
    transitionEligible: true,
    recurrenceSummary: "Every day",
    scheduleInteraction: {
      editScope: "series",
      dragEnabled: false,
      dragDisabledReason: "Recurring occurrences use the series editor.",
    },
  };
}
