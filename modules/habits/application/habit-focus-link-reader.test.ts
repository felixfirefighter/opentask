import type { Database, DatabaseExecutor } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  readOwned: vi.fn(),
  readOwnedMany: vi.fn(),
  searchOwned: vi.fn(),
}));

vi.mock("../infrastructure/habit-focus-link-repository", () => ({
  createHabitFocusLinkRepository: () => repository,
}));

import { createHabitFocusLinkReader } from "./habit-focus-link-reader";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const firstHabitId = "20000000-0000-4000-8000-000000000001";
const secondHabitId = "20000000-0000-4000-8000-000000000002";
const missingHabitId = "20000000-0000-4000-8000-000000000003";
const database = {} as Database;
const transaction = {} as DatabaseExecutor;

describe("habit focus-link reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hydrates active or archived owned history through the caller-provided executor", async () => {
    repository.readOwned
      .mockResolvedValueOnce({ id: firstHabitId, title: "Morning reset", archivedAt: null })
      .mockResolvedValueOnce({
        id: firstHabitId,
        title: "Morning reset",
        archivedAt: new Date("2026-07-21T01:00:00.000Z"),
      });
    const reader = createHabitFocusLinkReader(database);

    await expect(reader.readOwned({ userId }, firstHabitId, transaction)).resolves.toEqual({
      id: firstHabitId,
      title: "Morning reset",
      available: true,
    });
    await expect(reader.readOwned({ userId }, firstHabitId, transaction)).resolves.toEqual({
      id: firstHabitId,
      title: "Morning reset",
      available: false,
    });
    expect(repository.readOwned).toHaveBeenNthCalledWith(1, userId, firstHabitId, transaction);
    expect(repository.readOwned).toHaveBeenNthCalledWith(2, userId, firstHabitId, transaction);
  });

  it("returns null without leaking a foreign or missing habit", async () => {
    repository.readOwned.mockResolvedValue(null);

    await expect(
      createHabitFocusLinkReader(database).readOwned({ userId: otherUserId }, firstHabitId),
    ).resolves.toBeNull();
    expect(repository.readOwned).toHaveBeenCalledWith(otherUserId, firstHabitId, database);
  });

  it("hydrates a unique bounded batch once and restores caller order", async () => {
    repository.readOwnedMany.mockResolvedValue([
      { id: secondHabitId, title: "Second", archivedAt: null },
      {
        id: firstHabitId,
        title: "First",
        archivedAt: new Date("2026-07-21T01:00:00.000Z"),
      },
    ]);

    await expect(
      createHabitFocusLinkReader(database).readOwnedMany(
        { userId },
        [firstHabitId, missingHabitId, secondHabitId],
        transaction,
      ),
    ).resolves.toEqual([
      { id: firstHabitId, title: "First", available: false },
      { id: secondHabitId, title: "Second", available: true },
    ]);
    expect(repository.readOwnedMany).toHaveBeenCalledOnce();
    expect(repository.readOwnedMany).toHaveBeenCalledWith(
      userId,
      [firstHabitId, missingHabitId, secondHabitId],
      transaction,
    );
  });

  it("searches only after strict trimming and bounded validation", async () => {
    repository.searchOwned.mockResolvedValue([
      { id: firstHabitId, title: "Morning reset", archivedAt: null },
    ]);
    const reader = createHabitFocusLinkReader(database);

    await expect(reader.searchOwned({ userId }, { q: "  RESET  ", limit: 20 })).resolves.toEqual([
      { id: firstHabitId, title: "Morning reset", available: true },
    ]);
    expect(repository.searchOwned).toHaveBeenCalledWith(userId, { q: "RESET", limit: 20 });

    await expect(reader.searchOwned({ userId }, { q: " ", limit: 20 })).rejects.toThrow();
    await expect(reader.searchOwned({ userId }, { q: "unsafe\0query", limit: 20 })).rejects.toThrow();
    await expect(reader.searchOwned({ userId }, { q: "\ud800", limit: 20 })).rejects.toThrow();
    await expect(reader.searchOwned({ userId }, { q: "🚀".repeat(121), limit: 20 })).rejects.toThrow();
    await expect(reader.searchOwned({ userId }, { q: "valid", limit: 21 })).rejects.toThrow();
    await expect(
      reader.searchOwned({ userId }, { q: "valid", limit: 20, extra: true } as never),
    ).rejects.toThrow();
    expect(repository.searchOwned).toHaveBeenCalledOnce();
  });

  it("rejects malformed, duplicate, and oversized batches before repository access", async () => {
    const reader = createHabitFocusLinkReader(database);

    await expect(reader.readOwned({ userId }, "not-a-uuid")).rejects.toThrow();
    await expect(reader.readOwnedMany({ userId }, [firstHabitId, firstHabitId])).rejects.toThrow();
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
