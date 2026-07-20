import { afterEach, describe, expect, it, vi } from "vitest";

import {
  editRecurringTaskSchedule,
  endTaskRecurrence,
  getTaskRecurrence,
  setTaskRecurrence,
} from "./task-recurrence-api-client";

const taskId = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const definition = {
  preset: { kind: "daily" as const, interval: 1 },
  end: { kind: "never" as const },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("task recurrence API client", () => {
  it("loads the nullable owned recurrence with same-origin credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTaskRecurrence(taskId)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/tasks/${taskId}/recurrence`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("uses the frozen versioned paths and bodies for create, schedule edit, and end", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(mutationResult(4, "active")))
      .mockResolvedValueOnce(Response.json(mutationResult(5, "active")))
      .mockResolvedValueOnce(Response.json(mutationResult(6, "ended")));
    vi.stubGlobal("fetch", fetchMock);

    await setTaskRecurrence(taskId, { expectedVersion: 3, definition });
    await editRecurringTaskSchedule(taskId, {
      expectedVersion: 4,
      definition,
      schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
    });
    await endTaskRecurrence(taskId, { expectedVersion: 5 });

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      [`/api/v1/tasks/${taskId}/recurrence`, "PATCH", JSON.stringify({ expectedVersion: 3, definition })],
      [
        `/api/v1/tasks/${taskId}/recurrence/schedule`,
        "PATCH",
        JSON.stringify({
          expectedVersion: 4,
          definition,
          schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
        }),
      ],
      [`/api/v1/tasks/${taskId}/recurrence/end`, "POST", JSON.stringify({ expectedVersion: 5 })],
    ]);
  });
});

function mutationResult(version: number, lifecycle: "active" | "ended") {
  return {
    task: { id: taskId, version },
    recurrence: {
      taskId,
      taskVersion: version,
      generationMode: "schedule",
      timezone: "Asia/Singapore",
      definition,
      cutover: {
        kind: "all_day",
        projectionStartDate: "2026-07-20",
        projectionEndDate: lifecycle === "ended" ? "2026-07-23" : null,
      },
      lifecycle,
      createdAt: "2026-07-19T00:00:00Z",
      updatedAt: "2026-07-19T01:00:00Z",
    },
  };
}
