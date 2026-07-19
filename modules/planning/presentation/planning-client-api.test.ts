import { afterEach, describe, expect, it, vi } from "vitest";

import { setPlanningTaskSchedule } from "./planning-client-api";

const TASK_ID = "658ec0d3-6afd-4e42-bc86-a50dd90c330d";

afterEach(() => vi.unstubAllGlobals());

describe("planning client API", () => {
  it("accepts the canonical schedule mutation DTO returned by the task API", async () => {
    const schedule = {
      kind: "timed" as const,
      startAt: "2026-07-21T08:00:00.000Z",
      endAt: "2026-07-21T09:00:00.000Z",
      timezone: "Asia/Singapore",
    };
    const responseBody = {
      task: { id: TASK_ID, version: 3 },
      schedule: {
        ...schedule,
        taskId: TASK_ID,
        createdAt: "2026-07-19T10:00:00.000Z",
        updatedAt: "2026-07-19T10:01:00.000Z",
      },
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(setPlanningTaskSchedule(TASK_ID, 2, schedule)).resolves.toEqual(responseBody);
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/tasks/${TASK_ID}/schedule`,
      expect.objectContaining({ method: "PATCH", credentials: "same-origin" }),
    );
  });
});
