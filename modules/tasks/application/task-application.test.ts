import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskScheduleTable } from "../infrastructure/schema";

const repositories = vi.hoisted(() => ({
  tasks: {
    findById: vi.fn(),
    lockById: vi.fn(),
    listActivePage: vi.fn(),
    listActiveTerminalPage: vi.fn(),
    listActiveRankScope: vi.fn(),
    listDirectSubtasks: vi.fn(),
    insert: vi.fn(),
    updateDetails: vi.fn(),
    updateStatus: vi.fn(),
    move: vi.fn(),
    updateRank: vi.fn(),
    rewriteRanks: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    moveDirectSubtasks: vi.fn(),
    softDeleteActiveDirectSubtasks: vi.fn(),
    restoreDirectSubtasksFromDeletion: vi.fn(),
  },
  lists: { findActiveById: vi.fn(), lockById: vi.fn() },
  sections: { findById: vi.fn(), lockById: vi.fn() },
  checklist: { listByTask: vi.fn() },
  tags: { listActiveForTask: vi.fn(), listActiveForTasks: vi.fn() },
  recurrences: { listForTaskIds: vi.fn(), lockByTaskId: vi.fn(), replace: vi.fn() },
  schedules: { lockByTaskId: vi.fn() },
  lockRankScope: vi.fn(),
  lockRankScopes: vi.fn(),
}));

vi.mock("../infrastructure/task-repository", () => ({
  createTaskRepository: () => repositories.tasks,
}));
vi.mock("../infrastructure/task-list-repository", () => ({
  createTaskListRepository: () => repositories.lists,
}));
vi.mock("../infrastructure/section-repository", () => ({
  createSectionRepository: () => repositories.sections,
}));
vi.mock("../infrastructure/checklist-repository", () => ({
  createChecklistRepository: () => repositories.checklist,
}));
vi.mock("../infrastructure/tag-repository", () => ({
  createTagRepository: () => repositories.tags,
}));
vi.mock("../infrastructure/task-recurrence-repository", () => ({
  createTaskRecurrenceRepository: () => repositories.recurrences,
}));
vi.mock("../infrastructure/task-schedule-repository", () => ({
  createTaskScheduleRepository: () => repositories.schedules,
}));
vi.mock("../infrastructure/rank-scope-lock", () => ({
  lockRankScope: repositories.lockRankScope,
  lockRankScopes: repositories.lockRankScopes,
}));

import { createTaskApplication } from "./task-application";
import { generateRanksBetween } from "./ranking";

const userId = "10000000-0000-4000-8000-000000000001";
const listId = "20000000-0000-4000-8000-000000000001";
const destinationListId = "20000000-0000-4000-8000-000000000002";
const taskId = "30000000-0000-4000-8000-000000000001";
const childId = "30000000-0000-4000-8000-000000000002";
const oldChildId = "30000000-0000-4000-8000-000000000003";
const parentId = "30000000-0000-4000-8000-000000000004";
const checklistId = "40000000-0000-4000-8000-000000000001";
const tagId = "50000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-19T01:02:03.000Z");
const olderDeletion = new Date("2026-07-18T01:02:03.000Z");
const actor = { userId };
const transaction = { execute: vi.fn() };
const database = {
  transaction: vi.fn(async (work: (executor: typeof transaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: () => now };
const taskSchedules = {} as TaskScheduleTable;

function storedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    userId,
    listId,
    sectionId: null,
    parentTaskId: null,
    title: "Ship visual proof",
    descriptionMd: "Review the final screens.",
    status: "open",
    priority: "high",
    rank: "a0",
    statusChangedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

const activeList = {
  id: listId,
  userId,
  folderId: null,
  name: "Inbox",
  colorToken: "slate",
  rank: "a0",
  kind: "inbox",
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

describe("task application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.lists.findActiveById.mockResolvedValue(activeList);
    repositories.lists.lockById.mockImplementation(async (_userId: string, id: string) => ({
      ...activeList,
      id,
      kind: id === listId ? "inbox" : "regular",
    }));
    repositories.sections.findById.mockResolvedValue(null);
    repositories.sections.lockById.mockResolvedValue(null);
    repositories.tasks.findById.mockResolvedValue(storedTask());
    repositories.tasks.lockById.mockResolvedValue(storedTask());
    repositories.tasks.listActivePage.mockResolvedValue([]);
    repositories.tasks.listActiveTerminalPage.mockResolvedValue([]);
    repositories.tasks.listActiveRankScope.mockResolvedValue([]);
    repositories.tasks.listDirectSubtasks.mockResolvedValue([]);
    repositories.tasks.rewriteRanks.mockResolvedValue([]);
    repositories.checklist.listByTask.mockResolvedValue([]);
    repositories.tags.listActiveForTask.mockResolvedValue([]);
    repositories.tags.listActiveForTasks.mockResolvedValue([]);
    repositories.recurrences.listForTaskIds.mockResolvedValue([]);
    repositories.recurrences.lockByTaskId.mockResolvedValue(null);
    repositories.recurrences.replace.mockResolvedValue(null);
    repositories.schedules.lockByTaskId.mockResolvedValue(null);
    repositories.lockRankScope.mockResolvedValue(undefined);
    repositories.lockRankScopes.mockResolvedValue(undefined);
  });

  it("uses an internal 101-row lookahead for a public limit of 100", async () => {
    const ranks = generateRanksBetween(null, null, 101);
    const rows = Array.from({ length: 101 }, (_, index) =>
      storedTask({
        id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        rank: ranks[index]!,
      }),
    );
    repositories.tasks.listActivePage.mockResolvedValue(rows);

    const page = await createTaskApplication({ database, clock, taskSchedules }).listTasks(actor, {
      listId,
      parentTaskId: null,
      status: "open",
      limit: 100,
    });

    expect(page.items).toHaveLength(100);
    expect(page.nextCursor).not.toBeNull();
    expect(repositories.tasks.listActivePage).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ limit: 101 }),
    );
    expect(repositories.tags.listActiveForTasks).toHaveBeenCalledWith(
      userId,
      page.items.map(({ id }) => id),
    );
  });

  it("enriches a bounded task page with one bulk tag read", async () => {
    repositories.tasks.listActivePage.mockResolvedValue([storedTask()]);
    repositories.recurrences.listForTaskIds.mockResolvedValue([
      { taskId, projectionEndDate: null, projectionEndAt: null },
    ]);
    repositories.tags.listActiveForTasks.mockResolvedValue([
      {
        taskId,
        tag: {
          id: tagId,
          userId,
          name: "Launch",
          colorToken: "coral",
          version: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      },
    ]);

    const page = await createTaskApplication({ database, clock, taskSchedules }).listTasks(actor, {
      listId,
      parentTaskId: null,
      status: "open",
      limit: 50,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: taskId,
        tags: [expect.objectContaining({ id: tagId, name: "Launch" })],
        recurrence: { status: "active" },
      }),
    ]);
    expect(page.items[0]).not.toHaveProperty("userId");
    expect(page.items[0]?.tags[0]).not.toHaveProperty("userId");
    expect(repositories.tags.listActiveForTasks).toHaveBeenCalledOnce();
    expect(repositories.recurrences.listForTaskIds).toHaveBeenCalledWith(userId, [taskId]);
  });

  it("assembles active checklist, tag, and subtask detail without exposing owner columns", async () => {
    repositories.checklist.listByTask.mockResolvedValue([
      {
        id: checklistId,
        userId,
        taskId,
        title: "Verify mobile",
        isCompleted: false,
        rank: "a0",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    repositories.tags.listActiveForTask.mockResolvedValue([
      {
        id: tagId,
        userId,
        name: "Launch",
        colorToken: "coral",
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ]);
    repositories.tasks.listDirectSubtasks.mockResolvedValue([
      storedTask({ id: childId, parentTaskId: taskId, title: "Check spacing" }),
    ]);

    const detail = await createTaskApplication({ database, clock, taskSchedules }).getTask(actor, taskId);

    expect(detail).toMatchObject({
      id: taskId,
      checklistItems: [{ id: checklistId }],
      tags: [{ id: tagId }],
      subtasks: [{ id: childId, parentTaskId: taskId }],
    });
    expect(detail).not.toHaveProperty("userId");
  });

  it("creates once, replays equivalent UUID creates, and rejects mismatched reuse", async () => {
    const application = createTaskApplication({ database, clock, taskSchedules });
    repositories.tasks.lockById.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repositories.tasks.insert.mockResolvedValue(storedTask());

    await expect(
      application.createTask(actor, taskId, {
        listId,
        title: " Ship visual proof ",
        descriptionMd: "Review the final screens.",
        priority: "high",
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({ created: true, value: { id: taskId, title: "Ship visual proof" } });
    expect(repositories.tasks.insert).toHaveBeenCalledTimes(1);

    repositories.tasks.lockById.mockResolvedValue(storedTask());
    await expect(
      application.createTask(actor, taskId, {
        listId,
        title: "Ship visual proof",
        descriptionMd: "Review the final screens.",
        priority: "high",
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "start" },
      }),
    ).resolves.toMatchObject({ created: false, value: { id: taskId } });
    await expect(
      application.createTask(actor, taskId, {
        listId,
        title: "Different title",
        descriptionMd: "Review the final screens.",
        priority: "high",
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects status no-ops and applies an approved transition once", async () => {
    const application = createTaskApplication({ database, clock, taskSchedules });
    await expect(
      application.transitionTaskStatus(actor, taskId, { expectedVersion: 1, status: "open" }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
    expect(repositories.tasks.updateStatus).not.toHaveBeenCalled();

    repositories.tasks.updateStatus.mockResolvedValue({
      outcome: "applied",
      task: storedTask({ status: "completed", statusChangedAt: now, version: 2 }),
    });
    await expect(
      application.transitionTaskStatus(actor, taskId, { expectedVersion: 1, status: "completed" }),
    ).resolves.toMatchObject({ status: "completed", version: 2 });
    expect(repositories.tasks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", statusChangedAt: now, now }),
      transaction,
    );
  });

  it("locks both lists and moves a root plus its direct subtasks across lists", async () => {
    const child = storedTask({ id: childId, parentTaskId: taskId });
    repositories.tasks.listDirectSubtasks.mockResolvedValue([child]);
    repositories.tasks.lockById.mockImplementation(async (_userId: string, id: string) =>
      id === childId ? child : storedTask(),
    );
    repositories.tasks.move.mockResolvedValue({
      outcome: "applied",
      task: storedTask({ listId: destinationListId, rank: "a0", version: 2 }),
    });
    repositories.tasks.moveDirectSubtasks.mockResolvedValue([
      { ...child, listId: destinationListId, sectionId: null, version: 2 },
    ]);

    await createTaskApplication({ database, clock, taskSchedules }).moveTask(actor, taskId, {
      expectedVersion: 1,
      listId: destinationListId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
    });

    expect(repositories.lists.lockById.mock.calls.map((call) => call[1])).toEqual(
      [listId, destinationListId].sort(),
    );
    expect(repositories.tasks.moveDirectSubtasks).toHaveBeenCalledWith(
      expect.objectContaining({
        rootTaskId: taskId,
        sourceListId: listId,
        destinationListId,
        now,
      }),
      transaction,
    );
  });

  it.each([
    ["active", null],
    ["ended", "2026-07-20"],
  ] as const)(
    "rejects an %s recurring root becoming a subtask under task-recurrence-schedule lock order",
    async (_lifecycle, projectionEndDate) => {
      const root = storedTask();
      const parent = storedTask({ id: parentId, title: "Parent task" });
      repositories.tasks.findById.mockResolvedValue(root);
      repositories.tasks.lockById.mockImplementation(async (_userId: string, id: string) =>
        id === parentId ? parent : root,
      );
      repositories.recurrences.lockByTaskId.mockResolvedValue({
        taskId,
        projectionEndDate,
        projectionEndAt: null,
      });
      repositories.schedules.lockByTaskId.mockResolvedValue({ taskId, kind: "all_day" });

      await expect(
        createTaskApplication({ database, clock, taskSchedules }).moveTask(actor, taskId, {
          expectedVersion: 1,
          listId,
          sectionId: null,
          parentTaskId: parentId,
          placement: { kind: "end" },
        }),
      ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

      expect(repositories.tasks.move).not.toHaveBeenCalled();
      expect(repositories.tasks.listActiveRankScope).not.toHaveBeenCalled();
      const finalTaskLock = Math.max(...repositories.tasks.lockById.mock.invocationCallOrder);
      expect(finalTaskLock).toBeLessThan(
        repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
      );
      expect(repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
        repositories.schedules.lockByTaskId.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
      );
    },
  );

  it("returns a safe stale conflict when move, position, or restore waits on an old container", async () => {
    const application = createTaskApplication({ database, clock, taskSchedules });
    const activeObserved = storedTask();
    const activeMoved = storedTask({ listId: destinationListId, version: 2 });
    const deletedObserved = storedTask({ parentTaskId: parentId, deletedAt: olderDeletion, version: 2 });
    const deletedMoved = storedTask({
      listId: destinationListId,
      parentTaskId: parentId,
      deletedAt: olderDeletion,
      version: 3,
    });
    const races = [
      {
        observed: activeObserved,
        current: activeMoved,
        run: () =>
          application.moveTask(actor, taskId, {
            expectedVersion: 1,
            listId: destinationListId,
            sectionId: null,
            parentTaskId: null,
            placement: { kind: "end" },
          }),
      },
      {
        observed: activeObserved,
        current: activeMoved,
        run: () =>
          application.positionTask(actor, taskId, {
            expectedVersion: 1,
            placement: { kind: "end" },
          }),
      },
      {
        observed: deletedObserved,
        current: deletedMoved,
        run: () => application.restoreTask(actor, taskId, { expectedVersion: 2 }),
      },
    ];

    for (const race of races) {
      repositories.tasks.findById
        .mockReset()
        .mockResolvedValueOnce(race.observed)
        .mockResolvedValueOnce(race.current);
      repositories.lists.lockById.mockReset().mockResolvedValue(null);

      await expect(race.run()).rejects.toMatchObject({
        code: "CONFLICT",
        currentVersion: race.current.version,
      });
      expect(repositories.tasks.findById).toHaveBeenCalledTimes(2);
    }
  });

  it("keeps an unchanged or unowned task opaque when its requested container is unavailable", async () => {
    const application = createTaskApplication({ database, clock, taskSchedules });
    repositories.lists.lockById.mockResolvedValue(null);
    repositories.tasks.findById.mockResolvedValueOnce(storedTask()).mockResolvedValueOnce(storedTask());

    await expect(
      application.positionTask(actor, taskId, { expectedVersion: 1, placement: { kind: "end" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", currentVersion: undefined });

    repositories.tasks.findById.mockReset().mockResolvedValueOnce(storedTask()).mockResolvedValueOnce(null);
    await expect(
      application.positionTask(actor, taskId, { expectedVersion: 1, placement: { kind: "end" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", currentVersion: undefined });
  });

  it("uses one deletion event and restores only children from that event", async () => {
    const application = createTaskApplication({ database, clock, taskSchedules });
    const child = storedTask({ id: childId, parentTaskId: taskId });
    repositories.tasks.listDirectSubtasks.mockResolvedValue([child]);
    repositories.tasks.lockById.mockImplementation(async (_userId: string, id: string) =>
      id === childId ? child : storedTask(),
    );
    repositories.tasks.softDelete.mockResolvedValue({
      outcome: "applied",
      task: storedTask({ deletedAt: now, version: 2 }),
    });
    repositories.tasks.softDeleteActiveDirectSubtasks.mockResolvedValue([
      { ...child, deletedAt: now, version: 2 },
    ]);

    await application.deleteTask(actor, taskId, { expectedVersion: 1 });
    expect(repositories.lockRankScope).toHaveBeenCalledWith(transaction, [
      "task-subtask",
      userId,
      listId,
      taskId,
    ]);
    expect(repositories.lists.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.lockRankScope.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(repositories.lockRankScope.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.tasks.listDirectSubtasks.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(repositories.tasks.softDeleteActiveDirectSubtasks).toHaveBeenCalledWith(
      { userId, rootTaskId: taskId, deletionInstant: now, now },
      transaction,
    );

    const deletedRoot = storedTask({ deletedAt: now, version: 2 });
    const eventChild = storedTask({ id: childId, parentTaskId: taskId, deletedAt: now, version: 2 });
    const oldChild = storedTask({
      id: oldChildId,
      parentTaskId: taskId,
      deletedAt: olderDeletion,
      version: 2,
    });
    repositories.tasks.findById.mockResolvedValue(deletedRoot);
    repositories.tasks.listDirectSubtasks.mockResolvedValue([eventChild, oldChild]);
    repositories.tasks.lockById.mockImplementation(async (_userId: string, id: string) => {
      if (id === childId) return eventChild;
      if (id === oldChildId) return oldChild;
      return deletedRoot;
    });
    repositories.tasks.restore.mockResolvedValue({
      outcome: "applied",
      task: storedTask({ version: 3 }),
    });
    repositories.tasks.restoreDirectSubtasksFromDeletion.mockResolvedValue([
      { ...eventChild, deletedAt: null, version: 3 },
    ]);

    await application.restoreTask(actor, taskId, { expectedVersion: 2 });
    expect(repositories.tasks.restoreDirectSubtasksFromDeletion).toHaveBeenCalledWith(
      { userId, rootTaskId: taskId, deletionInstant: now, now },
      transaction,
    );
    expect(repositories.tasks.lockById).toHaveBeenCalledWith(userId, oldChildId, "any", transaction);
  });
});
