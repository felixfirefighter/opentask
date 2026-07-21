import type { Database, DatabaseExecutor } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock("../infrastructure/habit-repository", () => ({
  createHabitRepository: () => repository,
}));

import { createHabitSnapshotReader } from "./habit-snapshot-reader";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const habitId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-21T12:00:00.000Z");
const database = {} as Database;
const executor = {} as DatabaseExecutor;

describe("habit snapshot reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the narrow owned snapshot from the caller-provided transaction", async () => {
    repository.findById.mockResolvedValue({
      id: habitId,
      userId,
      title: "Morning reset",
      icon: "☀️",
      colorToken: "amber",
      goalKind: "boolean",
      targetValue: null,
      unit: null,
      version: 4,
      createdAt: now,
      updatedAt: now,
      archivedAt: now,
    });

    await expect(
      createHabitSnapshotReader(database).readOwned({ userId }, habitId, executor),
    ).resolves.toEqual({
      id: habitId,
      title: "Morning reset",
      version: 4,
      archived: true,
    });
    expect(repository.findById).toHaveBeenCalledWith(userId, habitId, executor);
  });

  it("returns null for an identifier outside the actor scope", async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      createHabitSnapshotReader(database).readOwned({ userId: otherUserId }, habitId),
    ).resolves.toBeNull();
    expect(repository.findById).toHaveBeenCalledWith(otherUserId, habitId, database);
  });

  it("rejects malformed identifiers before repository access", async () => {
    await expect(createHabitSnapshotReader(database).readOwned({ userId }, "not-a-uuid")).rejects.toThrow();
    expect(repository.findById).not.toHaveBeenCalled();
  });
});
