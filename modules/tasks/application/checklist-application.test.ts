import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  tasks: { lockById: vi.fn() },
  checklist: {
    lockById: vi.fn(),
    listByTask: vi.fn(),
    insert: vi.fn(),
    updateDetails: vi.fn(),
    updateRank: vi.fn(),
    rewriteRanks: vi.fn(),
    hardDelete: vi.fn(),
  },
  lockRankScope: vi.fn(),
}));

vi.mock("../infrastructure/task-repository", () => ({
  createTaskRepository: () => repositories.tasks,
}));
vi.mock("../infrastructure/checklist-repository", () => ({
  createChecklistRepository: () => repositories.checklist,
}));
vi.mock("../infrastructure/rank-scope-lock", () => ({
  lockRankScope: repositories.lockRankScope,
}));

import { createChecklistApplication } from "./checklist-application";

const userId = "10000000-0000-4000-8000-000000000001";
const listId = "20000000-0000-4000-8000-000000000001";
const taskId = "30000000-0000-4000-8000-000000000001";
const itemId = "40000000-0000-4000-8000-000000000001";
const otherItemId = "40000000-0000-4000-8000-000000000002";
const now = new Date("2026-07-19T01:02:03.000Z");
const actor = { userId };
const transaction = { execute: vi.fn() };
const database = {
  transaction: vi.fn(async (work: (executor: typeof transaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: () => now };

const parentTask = {
  id: taskId,
  userId,
  listId,
  sectionId: null,
  parentTaskId: null,
  title: "Ship visual proof",
  descriptionMd: "",
  status: "open",
  priority: "none",
  rank: "a0",
  statusChangedAt: now,
  version: 7,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

function storedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    userId,
    taskId,
    title: "Verify mobile",
    isCompleted: false,
    rank: "a0",
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("checklist application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.tasks.lockById.mockResolvedValue(parentTask);
    repositories.checklist.lockById.mockResolvedValue(storedItem());
    repositories.checklist.listByTask.mockResolvedValue([]);
    repositories.checklist.rewriteRanks.mockResolvedValue([]);
    repositories.lockRankScope.mockResolvedValue(undefined);
  });

  it("checks retained replays first, otherwise locks the active parent before ranking", async () => {
    const application = createChecklistApplication({ database, clock });
    repositories.checklist.lockById.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repositories.checklist.insert.mockResolvedValue(storedItem());

    await expect(
      application.createChecklistItem(actor, taskId, itemId, {
        title: " Verify mobile ",
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({ created: true, value: { id: itemId, title: "Verify mobile" } });
    expect(repositories.tasks.lockById).toHaveBeenCalledWith(userId, taskId, "active", transaction);
    expect(repositories.tasks.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.lockRankScope.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(parentTask.version).toBe(7);

    vi.clearAllMocks();
    repositories.checklist.lockById.mockResolvedValue(storedItem());
    await expect(
      application.createChecklistItem(actor, taskId, itemId, {
        title: "Verify mobile",
        placement: { kind: "start" },
      }),
    ).resolves.toMatchObject({ created: false, value: { id: itemId } });
    expect(repositories.tasks.lockById).not.toHaveBeenCalled();
    await expect(
      application.createChecklistItem(actor, taskId, itemId, {
        title: "Different",
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("uses checklist versions for completion and never transitions or versions the task", async () => {
    repositories.checklist.updateDetails.mockResolvedValue({
      outcome: "applied",
      item: storedItem({ isCompleted: true, version: 2 }),
    });

    await expect(
      createChecklistApplication({ database, clock }).updateChecklistItem(actor, taskId, itemId, {
        expectedVersion: 1,
        patch: { isCompleted: true },
      }),
    ).resolves.toMatchObject({ isCompleted: true, version: 2 });
    expect(repositories.checklist.updateDetails).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1, patch: { isCompleted: true }, now }),
      transaction,
    );
    expect(parentTask).toMatchObject({ status: "open", version: 7 });
  });

  it("reorders and hard-deletes nested rows only while the owned parent is active", async () => {
    const application = createChecklistApplication({ database, clock });
    const other = storedItem({ id: otherItemId, rank: "a1" });
    repositories.checklist.listByTask.mockResolvedValue([storedItem(), other]);
    repositories.checklist.updateRank.mockResolvedValue({
      outcome: "applied",
      item: storedItem({ rank: "a1V", version: 2 }),
    });

    await expect(
      application.positionChecklistItem(actor, taskId, itemId, {
        expectedVersion: 1,
        placement: { kind: "after", anchorId: otherItemId },
      }),
    ).resolves.toMatchObject({ id: itemId, version: 2 });

    repositories.checklist.hardDelete.mockResolvedValue({ outcome: "applied", item: storedItem() });
    await expect(
      application.deleteChecklistItem(actor, taskId, itemId, { expectedVersion: 1 }),
    ).resolves.toMatchObject({ id: itemId });

    repositories.tasks.lockById.mockResolvedValueOnce(null);
    await expect(
      application.deleteChecklistItem(actor, taskId, itemId, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repositories.checklist.hardDelete).toHaveBeenCalledTimes(1);
  });
});
