import type { Database } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  recurrences: { listForTaskIds: vi.fn() },
  search: { search: vi.fn() },
}));

vi.mock("../infrastructure/task-recurrence-repository", () => ({
  createTaskRecurrenceRepository: () => repositories.recurrences,
}));
vi.mock("../infrastructure/task-search-repository", () => ({
  createTaskSearchRepository: () => repositories.search,
}));

import { createSearchApplication } from "./search-application";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const listId = "30000000-0000-4000-8000-000000000001";
const tagId = "40000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-19T01:02:03.000Z");
const actor = { userId };
const database = {} as Database;

function task(deletedAt: Date | null = null) {
  return {
    id: taskId,
    userId,
    listId,
    sectionId: null,
    parentTaskId: null,
    title: "Ship the demo",
    descriptionMd: "Verify the release",
    status: "open" as const,
    priority: "high" as const,
    rank: "a0",
    statusChangedAt: now,
    version: 3,
    createdAt: now,
    updatedAt: now,
    deletedAt,
  };
}

function tag(deletedAt: Date | null = null) {
  return {
    id: tagId,
    userId,
    name: "Launch",
    colorToken: "coral",
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt,
  };
}

describe("search application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.recurrences.listForTaskIds.mockResolvedValue([]);
    repositories.search.search.mockResolvedValue({
      items: [
        {
          task: task(),
          list: { id: listId, name: "Launch" },
          matchedFields: ["title", "tag"],
          matchingTags: [tag()],
        },
      ],
      next: null,
    });
  });

  it("parses strict queries and maps search DTOs without persistence fields", async () => {
    const result = await createSearchApplication({ database }).searchTasks(actor, {
      q: " launch ",
      limit: 20,
    });

    expect(repositories.search.search).toHaveBeenCalledWith(userId, { q: "launch", limit: 20 });
    expect(result).toEqual({
      items: [
        {
          task: {
            id: taskId,
            listId,
            sectionId: null,
            parentTaskId: null,
            title: "Ship the demo",
            descriptionMd: "Verify the release",
            status: "open",
            priority: "high",
            rank: "a0",
            statusChangedAt: now.toISOString(),
            version: 3,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            deletedAt: null,
          },
          list: { id: listId, name: "Launch" },
          recurrence: null,
          matchedFields: ["title", "tag"],
          matchingTags: [
            {
              id: tagId,
              name: "Launch",
              colorToken: "coral",
              version: 1,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
              deletedAt: null,
            },
          ],
        },
      ],
      nextCursor: null,
    });
    expect(repositories.recurrences.listForTaskIds).toHaveBeenCalledWith(userId, [taskId]);
    expect(JSON.stringify(result)).not.toContain("userId");
  });

  it("maps an actor-scoped recurrence summary without exposing the stored rule", async () => {
    repositories.recurrences.listForTaskIds.mockResolvedValueOnce([
      {
        taskId,
        projectionEndDate: null,
        projectionEndAt: null,
        rrule: "FREQ=DAILY;INTERVAL=1",
      },
    ]);

    const result = await createSearchApplication({ database }).searchTasks(actor, {
      q: "ship",
      limit: 20,
    });

    expect(repositories.recurrences.listForTaskIds).toHaveBeenCalledWith(userId, [taskId]);
    expect(result.items[0]?.recurrence).toEqual({ status: "active" });
    expect(JSON.stringify(result)).not.toContain("FREQ=DAILY");
  });

  it("round-trips stable cursor coordinates and accepts 120 Unicode code points", async () => {
    const application = createSearchApplication({ database });
    repositories.search.search.mockResolvedValueOnce({
      items: [],
      next: { updatedAt: now, id: taskId },
    });
    const first = await application.searchTasks(actor, { q: "🚀".repeat(120), limit: 1 });
    expect(first.nextCursor).toEqual(expect.any(String));

    repositories.search.search.mockResolvedValueOnce({ items: [], next: null });
    await application.searchTasks(actor, { q: "ship", limit: 1, cursor: first.nextCursor! });
    expect(repositories.search.search).toHaveBeenLastCalledWith(userId, {
      q: "ship",
      limit: 1,
      after: { updatedAt: now, id: taskId },
    });
  });

  it("maps invalid cursors and unknown query fields to VALIDATION_FAILED before search", async () => {
    const application = createSearchApplication({ database });
    await expect(
      application.searchTasks(actor, { q: "ship", cursor: "bm90LWpzb24", limit: 20 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", currentVersion: undefined });
    await expect(
      application.searchTasks(actor, { q: "ship", limit: 20, userId } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", currentVersion: undefined });
    expect(repositories.search.search).not.toHaveBeenCalled();
  });

  it("refuses deleted task or tag rows instead of leaking them", async () => {
    const application = createSearchApplication({ database });
    repositories.search.search.mockResolvedValueOnce({
      items: [
        {
          task: task(now),
          list: { id: listId, name: "Launch" },
          matchedFields: ["title"],
          matchingTags: [],
        },
      ],
      next: null,
    });
    await expect(application.searchTasks(actor, { q: "ship", limit: 20 })).rejects.toThrow(
      "Search repository returned deleted data.",
    );

    repositories.search.search.mockResolvedValueOnce({
      items: [
        {
          task: task(),
          list: { id: listId, name: "Launch" },
          matchedFields: ["tag"],
          matchingTags: [tag(now)],
        },
      ],
      next: null,
    });
    await expect(application.searchTasks(actor, { q: "launch", limit: 20 })).rejects.toThrow(
      "Search repository returned deleted data.",
    );
  });
});
