import type { Database, DatabaseExecutor } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  readOwned: vi.fn(),
  readOwnedMany: vi.fn(),
  searchOwned: vi.fn(),
}));

vi.mock("../infrastructure/task-focus-link-repository", () => ({
  createTaskFocusLinkRepository: () => repository,
}));

import { createTaskFocusLinkReader } from "./task-focus-link-reader";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const firstTaskId = "20000000-0000-4000-8000-000000000001";
const secondTaskId = "20000000-0000-4000-8000-000000000002";
const missingTaskId = "20000000-0000-4000-8000-000000000003";
const database = {} as Database;
const transaction = {} as DatabaseExecutor;

describe("task focus-link reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hydrates owned active or deleted history through the caller-provided executor", async () => {
    repository.readOwned
      .mockResolvedValueOnce({
        id: firstTaskId,
        title: "Ship the demo",
        status: "completed",
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: firstTaskId,
        title: "Ship the demo",
        status: "cancelled",
        deletedAt: new Date("2026-07-21T01:00:00.000Z"),
      });
    const reader = createTaskFocusLinkReader(database);

    await expect(reader.readOwned({ userId }, firstTaskId, transaction)).resolves.toEqual({
      id: firstTaskId,
      title: "Ship the demo",
      status: "completed",
      available: true,
    });
    await expect(reader.readOwned({ userId }, firstTaskId, transaction)).resolves.toEqual({
      id: firstTaskId,
      title: "Ship the demo",
      status: "cancelled",
      available: false,
    });
    expect(repository.readOwned).toHaveBeenNthCalledWith(1, userId, firstTaskId, transaction);
    expect(repository.readOwned).toHaveBeenNthCalledWith(2, userId, firstTaskId, transaction);
  });

  it("returns null without leaking a foreign or missing task", async () => {
    repository.readOwned.mockResolvedValue(null);

    await expect(
      createTaskFocusLinkReader(database).readOwned({ userId: otherUserId }, firstTaskId),
    ).resolves.toBeNull();
    expect(repository.readOwned).toHaveBeenCalledWith(otherUserId, firstTaskId, database);
  });

  it("hydrates a unique bounded batch once and restores caller order", async () => {
    repository.readOwnedMany.mockResolvedValue([
      { id: secondTaskId, title: "Second", status: "cancelled", deletedAt: null },
      {
        id: firstTaskId,
        title: "First",
        status: "open",
        deletedAt: new Date("2026-07-21T01:00:00.000Z"),
      },
    ]);

    await expect(
      createTaskFocusLinkReader(database).readOwnedMany(
        { userId },
        [firstTaskId, missingTaskId, secondTaskId],
        transaction,
      ),
    ).resolves.toEqual([
      { id: firstTaskId, title: "First", status: "open", available: false },
      { id: secondTaskId, title: "Second", status: "cancelled", available: true },
    ]);
    expect(repository.readOwnedMany).toHaveBeenCalledOnce();
    expect(repository.readOwnedMany).toHaveBeenCalledWith(
      userId,
      [firstTaskId, missingTaskId, secondTaskId],
      transaction,
    );
  });

  it("searches only after strict trimming and bounded validation", async () => {
    repository.searchOwned.mockResolvedValue([
      { id: firstTaskId, title: "Ship the demo", status: "completed", deletedAt: null },
    ]);
    const reader = createTaskFocusLinkReader(database);

    await expect(reader.searchOwned({ userId }, { q: "  DEMO  ", limit: 20 })).resolves.toEqual([
      { id: firstTaskId, title: "Ship the demo", status: "completed", available: true },
    ]);
    expect(repository.searchOwned).toHaveBeenCalledWith(userId, { q: "DEMO", limit: 20 });

    await expect(reader.searchOwned({ userId }, { q: " ", limit: 20 })).rejects.toThrow();
    await expect(reader.searchOwned({ userId }, { q: "🚀".repeat(121), limit: 20 })).rejects.toThrow();
    await expect(reader.searchOwned({ userId }, { q: "valid", limit: 21 })).rejects.toThrow();
    await expect(
      reader.searchOwned({ userId }, { q: "valid", limit: 20, extra: true } as never),
    ).rejects.toThrow();
    expect(repository.searchOwned).toHaveBeenCalledOnce();
  });

  it("rejects malformed, duplicate, and oversized batches before repository access", async () => {
    const reader = createTaskFocusLinkReader(database);

    await expect(reader.readOwned({ userId }, "not-a-uuid")).rejects.toThrow();
    await expect(reader.readOwnedMany({ userId }, [firstTaskId, firstTaskId])).rejects.toThrow();
    await expect(
      reader.readOwnedMany(
        { userId },
        Array.from(
          { length: 51 },
          (_, index) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
      ),
    ).rejects.toThrow();
    expect(repository.readOwned).not.toHaveBeenCalled();
    expect(repository.readOwnedMany).not.toHaveBeenCalled();
  });
});
