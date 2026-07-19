import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearTaskSchedule,
  getSchedulePreferences,
  getTaskSchedule,
  setTaskSchedule,
} from "./task-schedule-api-client";

const taskId = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("task schedule API client", () => {
  it("loads the canonical nullable schedule with private same-origin credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTaskSchedule(taskId)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/tasks/${taskId}/schedule`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("sets a validated all-day schedule with the current task version", async () => {
    const result = {
      task: { id: taskId, version: 4 },
      schedule: {
        taskId,
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-21",
        createdAt: "2026-07-19T00:00:00Z",
        updatedAt: "2026-07-19T00:00:00Z",
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      setTaskSchedule(taskId, {
        expectedVersion: 3,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      }),
    ).resolves.toEqual(result);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        expectedVersion: 3,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      }),
    });
  });

  it("clears through the dedicated versioned command and reads schedule preferences", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ task: { id: taskId, version: 5 }, schedule: null }))
      .mockResolvedValueOnce(
        Response.json({
          schemaVersion: 1,
          version: 2,
          timezone: "Asia/Singapore",
          weekStart: 1,
          hourCycle: "h23",
          theme: "system",
          reducedMotion: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearTaskSchedule(taskId, { expectedVersion: 4 })).resolves.toMatchObject({
      task: { version: 5 },
      schedule: null,
    });
    await expect(getSchedulePreferences()).resolves.toEqual({
      timeZone: "Asia/Singapore",
      hourCycle: "h23",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/tasks/${taskId}/schedule/clear`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ expectedVersion: 4 }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/preferences");
  });
});
