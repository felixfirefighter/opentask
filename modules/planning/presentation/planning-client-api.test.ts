import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPlanningTaskWithSchedule,
  listPlanningTaskLists,
  setPlanningTaskSchedule,
  transitionPlanningOccurrence,
} from "./planning-client-api";

const TASK_ID = "658ec0d3-6afd-4e42-bc86-a50dd90c330d";
const LIST_ID = "d62cd6af-f696-488c-94f9-fe8dcf672cf3";

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

  it("sends every Calendar create field through the atomic task-and-schedule command", async () => {
    const schedule = {
      kind: "all_day" as const,
      startDate: "2026-07-21",
      endDate: "2026-07-22",
    };
    const responseBody = {
      task: { id: TASK_ID, version: 1 },
      schedule: {
        ...schedule,
        taskId: TASK_ID,
        createdAt: "2026-07-19T10:00:00.000Z",
        updatedAt: "2026-07-19T10:00:00.000Z",
      },
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await createPlanningTaskWithSchedule(TASK_ID, {
      title: "Prepare calendar demo",
      descriptionMd: "## Run of show",
      priority: "high",
      listId: LIST_ID,
      schedule,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/tasks/with-schedule",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          title: "Prepare calendar demo",
          descriptionMd: "## Run of show",
          priority: "high",
          listId: LIST_ID,
          sectionId: null,
          parentTaskId: null,
          placement: { kind: "start" },
          schedule,
        }),
      }),
    );
  });

  it("loads a bounded page of owned regular-list destinations", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: LIST_ID,
              name: "Launch",
              folderId: null,
              colorToken: "coral",
              rank: "a0",
              kind: "regular",
              version: 1,
              createdAt: "2026-07-19T10:00:00.000Z",
              updatedAt: "2026-07-19T10:00:00.000Z",
              deletedAt: null,
            },
          ],
          nextCursor: "next-page",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(listPlanningTaskLists("current-page")).resolves.toEqual({
      items: [{ id: LIST_ID, name: "Launch" }],
      nextCursor: "next-page",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/lists?limit=100&cursor=current-page",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("sends an occurrence transition with task identity, opaque key, and expected version", async () => {
    const occurrenceKey = "o1.b2NjdXJyZW5jZS1rZXktMQ";
    const responseBody = {
      outcome: "applied",
      action: "skip",
      occurrenceKey,
      expectedVersion: 2,
      task: { id: TASK_ID, version: 3 },
      occurrenceState: "skipped",
      eventTaskVersion: 3,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(transitionPlanningOccurrence(TASK_ID, 2, occurrenceKey, "skip")).resolves.toEqual(
      responseBody,
    );
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/tasks/${TASK_ID}/occurrences/transition`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ action: "skip", occurrenceKey, expectedVersion: 2 }),
      }),
    );
  });
});
