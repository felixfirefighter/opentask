import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  list: {
    findActiveById: vi.fn(),
    lockById: vi.fn(),
  },
  section: {
    findById: vi.fn(),
    lockById: vi.fn(),
    list: vi.fn(),
    listRanks: vi.fn(),
    insert: vi.fn(),
    updateName: vi.fn(),
    updateRank: vi.fn(),
    rewriteRanks: vi.fn(),
    hasActiveTasks: vi.fn(),
    clearDeletedTaskReferences: vi.fn(),
    deleteEmpty: vi.fn(),
  },
  lockRankScope: vi.fn(),
}));

vi.mock("../infrastructure/section-repository", () => ({
  createSectionRepository: () => repositories.section,
}));
vi.mock("../infrastructure/task-list-repository", () => ({
  createTaskListRepository: () => repositories.list,
}));
vi.mock("../infrastructure/rank-scope-lock", () => ({
  lockRankScope: repositories.lockRankScope,
}));

import { createSectionApplication } from "./section-application";

const userId = "10000000-0000-4000-8000-000000000001";
const listId = "20000000-0000-4000-8000-000000000001";
const sectionId = "30000000-0000-4000-8000-000000000001";
const otherSectionId = "30000000-0000-4000-8000-000000000002";
const now = new Date("2026-07-19T01:02:03.000Z");
const actor = { userId };
const transaction = { execute: vi.fn() };
const database = {
  transaction: vi.fn(async (work: (executor: typeof transaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: () => now };

const activeInbox = {
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

const section = {
  id: sectionId,
  userId,
  listId,
  name: "Focus",
  rank: "a0",
  version: 1,
  createdAt: now,
  updatedAt: now,
};

describe("section application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.list.findActiveById.mockResolvedValue(activeInbox);
    repositories.list.lockById.mockResolvedValue(activeInbox);
    repositories.section.findById.mockResolvedValue(section);
    repositories.section.lockById.mockResolvedValue(section);
    repositories.section.list.mockResolvedValue([section]);
    repositories.section.listRanks.mockResolvedValue([{ id: sectionId, rank: "a0" }]);
    repositories.section.insert.mockResolvedValue(section);
    repositories.section.updateName.mockResolvedValue({ ...section, name: "Renamed", version: 2 });
    repositories.section.updateRank.mockImplementation(async (input: { rank: string }) => ({
      ...section,
      rank: input.rank,
      version: 2,
      updatedAt: now,
    }));
    repositories.section.rewriteRanks.mockResolvedValue([]);
    repositories.section.hasActiveTasks.mockResolvedValue(false);
    repositories.section.clearDeletedTaskReferences.mockResolvedValue(undefined);
    repositories.section.deleteEmpty.mockResolvedValue(section);
    repositories.lockRankScope.mockResolvedValue(undefined);
  });

  it("lists and gets DTOs only after validating the active owned list", async () => {
    const application = createSectionApplication({ database, clock });

    await expect(application.listSections(actor, listId, { limit: 20 })).resolves.toEqual({
      items: [
        {
          id: sectionId,
          listId,
          name: "Focus",
          rank: "a0",
          version: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      nextCursor: null,
    });
    await expect(application.getSection(actor, listId, sectionId)).resolves.toMatchObject({ id: sectionId });
    expect(repositories.list.findActiveById).toHaveBeenCalledWith(userId, listId, database);
  });

  it("creates sections in an Inbox and replays only equivalent UUID-key requests", async () => {
    const application = createSectionApplication({ database, clock });
    repositories.section.lockById.mockResolvedValue(null);

    await expect(
      application.createSection(actor, listId, sectionId, { name: " Focus ", placement: { kind: "end" } }),
    ).resolves.toMatchObject({ created: true, value: { id: sectionId, name: "Focus", rank: "a0" } });
    expect(repositories.lockRankScope).toHaveBeenCalledWith(transaction, ["sections", userId, listId]);
    expect(repositories.section.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: sectionId, userId, listId, name: "Focus", rank: "a0", now }),
      transaction,
    );

    repositories.section.lockById.mockResolvedValue(section);
    repositories.list.lockById.mockClear();
    await expect(
      application.createSection(actor, listId, sectionId, {
        name: "Focus",
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({
      created: false,
      value: { id: sectionId },
    });
    expect(repositories.list.lockById).not.toHaveBeenCalled();
    await expect(
      application.createSection(actor, listId, sectionId, {
        name: "Different",
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("returns scoped NOT_FOUND and a safe currentVersion for stale updates", async () => {
    const application = createSectionApplication({ database, clock });
    repositories.list.lockById.mockResolvedValueOnce(null);
    await expect(
      application.updateSection(actor, listId, sectionId, {
        expectedVersion: 1,
        patch: { name: "Renamed" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", currentVersion: undefined });
    expect(repositories.section.lockById).not.toHaveBeenCalled();

    repositories.list.lockById.mockResolvedValue(activeInbox);
    repositories.section.lockById.mockResolvedValue({ ...section, version: 4 });
    await expect(
      application.updateSection(actor, listId, sectionId, {
        expectedVersion: 1,
        patch: { name: "Renamed" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 4 });
    expect(repositories.section.updateName).not.toHaveBeenCalled();

    repositories.section.lockById.mockResolvedValue(section);
    await expect(
      application.updateSection(actor, listId, sectionId, {
        expectedVersion: 1,
        patch: { name: " Renamed " },
      }),
    ).resolves.toMatchObject({ id: sectionId, name: "Renamed", version: 2 });
    expect(repositories.section.updateName).toHaveBeenCalledWith(
      expect.objectContaining({ userId, listId, id: sectionId, expectedVersion: 1, name: "Renamed", now }),
      transaction,
    );
  });

  it("positions inside the advisory-locked per-list scope", async () => {
    const application = createSectionApplication({ database, clock });
    repositories.section.listRanks.mockResolvedValue([
      { id: sectionId, rank: "a0" },
      { id: otherSectionId, rank: "a1" },
    ]);

    const result = await application.positionSection(actor, listId, sectionId, {
      expectedVersion: 1,
      placement: { kind: "after", anchorId: otherSectionId },
    });

    expect(repositories.lockRankScope).toHaveBeenCalledWith(transaction, ["sections", userId, listId]);
    expect(result.rank > "a1").toBe(true);
    expect(result.version).toBe(2);
  });

  it("rejects nonempty deletion and atomically clears deleted-task references before hard delete", async () => {
    const application = createSectionApplication({ database, clock });
    repositories.section.hasActiveTasks.mockResolvedValueOnce(true);
    await expect(
      application.deleteSection(actor, listId, sectionId, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
    expect(repositories.section.clearDeletedTaskReferences).not.toHaveBeenCalled();
    expect(repositories.section.deleteEmpty).not.toHaveBeenCalled();

    repositories.section.hasActiveTasks.mockResolvedValue(false);
    await expect(
      application.deleteSection(actor, listId, sectionId, { expectedVersion: 1 }),
    ).resolves.toMatchObject({ id: sectionId, version: 1 });
    expect(repositories.section.clearDeletedTaskReferences).toHaveBeenCalledWith(
      userId,
      listId,
      sectionId,
      now,
      transaction,
    );
    expect(repositories.section.clearDeletedTaskReferences.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.section.deleteEmpty.mock.invocationCallOrder[0]!,
    );
  });
});
