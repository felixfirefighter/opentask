import type { DatabaseTransaction } from "@/shared/db/client";
import { describe, expect, it, vi } from "vitest";

import { createTaskLifecycleLocks } from "./task-lifecycle-locks";
import type { StoredTask } from "../infrastructure/task-repository";

type LifecycleRepositories = Parameters<typeof createTaskLifecycleLocks>[0];

describe("task lifecycle locks", () => {
  it("uses explicit ordinal ordering for container and task row locks", async () => {
    const listLockOrder: string[] = [];
    const sectionLockOrder: string[] = [];
    const taskLockOrder: string[] = [];
    const repositories = {
      tasks: {
        findById: vi.fn(),
        lockById: vi.fn(async (_userId: string, id: string) => {
          taskLockOrder.push(id);
          return storedTask({ id });
        }),
      } as unknown as LifecycleRepositories["tasks"],
      lists: {
        lockById: vi.fn(async (_userId: string, id: string) => {
          listLockOrder.push(id);
          return { deletedAt: null };
        }),
      } as unknown as LifecycleRepositories["lists"],
      sections: {
        lockById: vi.fn(async (_userId: string, listId: string, sectionId: string) => {
          sectionLockOrder.push(`${listId}:${sectionId}`);
          return { id: sectionId };
        }),
      } as unknown as LifecycleRepositories["sections"],
    };
    const locks = createTaskLifecycleLocks(repositories);
    const transaction = {} as DatabaseTransaction;

    await locks.lockContainers(
      "user",
      [
        { listId: "z", sectionId: "beta" },
        { listId: "ä", sectionId: "alpha" },
        { listId: "a", sectionId: "omega" },
      ],
      storedTask(),
      transaction,
    );
    await locks.lockTasks("user", ["z", "ä", "a", "z"], transaction);

    expect(listLockOrder).toEqual(["a", "z", "ä"]);
    expect(sectionLockOrder).toEqual(["a:omega", "z:beta", "ä:alpha"]);
    expect(taskLockOrder).toEqual(["a", "z", "ä"]);
  });
});

function storedTask(overrides: Partial<StoredTask> = {}): StoredTask {
  const now = new Date("2026-07-19T01:02:03.000Z");
  return {
    id: "30000000-0000-4000-8000-000000000001",
    userId: "10000000-0000-4000-8000-000000000001",
    listId: "20000000-0000-4000-8000-000000000001",
    sectionId: null,
    parentTaskId: null,
    title: "Task",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}
