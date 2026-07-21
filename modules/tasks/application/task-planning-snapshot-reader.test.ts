import type { DatabaseTransaction } from "@/shared/db/client";
import { describe, expect, it, vi } from "vitest";

import type { BoundedTaskOccurrencePage } from "./contracts";
import { createTaskPlanningSnapshotReader } from "./task-planning-snapshot-reader";
import type { TaskReadSnapshot } from "./task-read-snapshot";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const transaction = {} as DatabaseTransaction;
const occurrenceQuery = {
  rangeStartDate: "2026-07-20",
  rangeEndDate: "2026-07-21",
  rangeStartAt: "2026-07-19T16:00:00.000Z",
  rangeEndAt: "2026-07-20T16:00:00.000Z",
  limit: 100,
} as const;

describe("task planning snapshot reader", () => {
  it("reads canonical tasks and every bounded occurrence range sequentially on one transaction", async () => {
    const snapshot: TaskReadSnapshot = { run: vi.fn((work) => work(transaction)) };
    const readOpenTasksInSnapshot = vi.fn(async () => ({ items: [], truncated: false }));
    const readOccurrencesInSnapshot = vi.fn(async () => occurrencePage());
    const reader = createTaskPlanningSnapshotReader({
      snapshot,
      readOpenTasksInSnapshot,
      readOccurrencesInSnapshot,
    });

    const result = await reader.readPlanningSnapshot(actor, {
      timeZone: "Asia/Singapore",
      taskQuery: { kind: "all_open", limit: 100 },
      occurrenceQueries: [occurrenceQuery, { ...occurrenceQuery, rangeEndDate: "2026-07-22" }],
    });

    expect(result).toEqual({
      taskPage: { items: [], truncated: false },
      occurrencePages: [occurrencePage(), occurrencePage()],
    });
    expect(snapshot.run).toHaveBeenCalledOnce();
    expect(readOpenTasksInSnapshot).toHaveBeenCalledWith(
      actor,
      { kind: "all_open", limit: 100 },
      transaction,
    );
    expect(readOccurrencesInSnapshot).toHaveBeenNthCalledWith(
      1,
      actor,
      occurrenceQuery,
      transaction,
      "Asia/Singapore",
    );
    expect(readOccurrencesInSnapshot).toHaveBeenNthCalledWith(
      2,
      actor,
      { ...occurrenceQuery, rangeEndDate: "2026-07-22" },
      transaction,
      "Asia/Singapore",
    );
    expect(readOpenTasksInSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      readOccurrencesInSnapshot.mock.invocationCallOrder[0]!,
    );
    expect(readOccurrencesInSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      readOccurrencesInSnapshot.mock.invocationCallOrder[1]!,
    );
  });

  it("rejects a batch larger than the released Today and Matrix composition", async () => {
    const snapshot: TaskReadSnapshot = { run: vi.fn((work) => work(transaction)) };
    const reader = createTaskPlanningSnapshotReader({
      snapshot,
      readOpenTasksInSnapshot: vi.fn(),
      readOccurrencesInSnapshot: vi.fn(),
    });

    await expect(
      reader.readPlanningSnapshot(actor, {
        timeZone: "Asia/Singapore",
        taskQuery: { kind: "all_open", limit: 100 },
        occurrenceQueries: [occurrenceQuery, occurrenceQuery, occurrenceQuery],
      }),
    ).rejects.toThrow();
    expect(snapshot.run).not.toHaveBeenCalled();
  });
});

function occurrencePage(): BoundedTaskOccurrencePage {
  return {
    items: [],
    truncation: {
      truncated: false,
      reasons: [],
      recurrenceRowsEvaluated: 0,
      occurrenceEventsEvaluated: 0,
      candidateEvaluations: 0,
    },
  };
}
