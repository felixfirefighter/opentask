import { describe, expect, it, vi } from "vitest";

import type { HabitFocusLinkReader } from "@/modules/habits";
import type { TaskFocusLinkReader } from "@/modules/tasks";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { createHabitFocusLinkValidator, createTaskFocusLinkValidator } from "./focus-link-adapters";

const actor: AuthenticatedActor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const habitId = "60000000-0000-4000-8000-000000000001";
const executor = {} as DatabaseExecutor;

describe("focus link adapters", () => {
  it("keeps unavailable task titles private while preserving historical identity", async () => {
    const reader = {
      readOwned: vi.fn(async () => ({
        id: taskId,
        title: "Private deleted task",
        status: "completed" as const,
        available: false,
      })),
      readOwnedMany: vi.fn(async () => [
        { id: taskId, title: "Private deleted task", status: "completed" as const, available: false },
      ]),
      searchOwned: vi.fn(async () => []),
    } satisfies TaskFocusLinkReader;
    const adapter = createTaskFocusLinkValidator(reader);

    await expect(adapter.readOwned(actor, taskId, executor)).resolves.toEqual({
      kind: "task",
      id: taskId,
      label: null,
      available: false,
    });
    await expect(adapter.readOwnedMany(actor, [taskId], executor)).resolves.toEqual([
      { kind: "task", id: taskId, label: null, available: false },
    ]);
    expect(reader.readOwnedMany).toHaveBeenCalledWith(actor, [taskId], executor);
  });

  it("maps active habit search results to the narrow Focus contract", async () => {
    const reader = {
      readOwned: vi.fn(async () => null),
      readOwnedMany: vi.fn(async () => []),
      searchOwned: vi.fn(async () => [{ id: habitId, title: "Walk", available: true }]),
    } satisfies HabitFocusLinkReader;
    const adapter = createHabitFocusLinkValidator(reader);

    await expect(adapter.searchOwned(actor, { q: "walk", limit: 5 })).resolves.toEqual([
      { kind: "habit", id: habitId, label: "Walk", available: true },
    ]);
    expect(reader.searchOwned).toHaveBeenCalledWith(actor, { q: "walk", limit: 5 });
  });
});
