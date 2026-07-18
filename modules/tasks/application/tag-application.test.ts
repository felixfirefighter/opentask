import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  tag: {
    findActiveById: vi.fn(),
    lockById: vi.fn(),
    resolveActivePageCursor: vi.fn(),
    findActiveEquivalentName: vi.fn(),
    lockNameMutations: vi.fn(),
    listActive: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    listActiveForTask: vi.fn(),
    replaceForActiveTask: vi.fn(),
  },
}));

vi.mock("../infrastructure/tag-repository", () => ({
  createTagRepository: () => repositories.tag,
}));

import { createTagApplication } from "./tag-application";
import { tagPageSchema } from "./contracts";

const userId = "10000000-0000-4000-8000-000000000001";
const tagId = "20000000-0000-4000-8000-000000000001";
const secondTagId = "20000000-0000-4000-8000-000000000002";
const taskId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-19T01:02:03.000Z");
const actor = { userId };
const transaction = { execute: vi.fn() };
const database = {
  transaction: vi.fn(async (work: (executor: typeof transaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: () => now };

function tag(
  overrides: Partial<{
    id: string;
    name: string;
    colorToken: string;
    version: number;
    deletedAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? tagId,
    userId,
    name: overrides.name ?? "Launch",
    colorToken: overrides.colorToken ?? "coral",
    version: overrides.version ?? 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe("tag application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.tag.findActiveById.mockResolvedValue(tag());
    repositories.tag.lockById.mockResolvedValue(null);
    repositories.tag.resolveActivePageCursor.mockResolvedValue({ normalizedName: "focus", id: tagId });
    repositories.tag.findActiveEquivalentName.mockResolvedValue(null);
    repositories.tag.lockNameMutations.mockResolvedValue(undefined);
    repositories.tag.listActive.mockResolvedValue([]);
    repositories.tag.insert.mockResolvedValue(tag());
    repositories.tag.update.mockResolvedValue(tag({ version: 2 }));
    repositories.tag.softDelete.mockResolvedValue(tag({ version: 2, deletedAt: now }));
    repositories.tag.restore.mockResolvedValue(tag({ version: 2 }));
    repositories.tag.replaceForActiveTask.mockResolvedValue({
      kind: "updated",
      taskId,
      version: 2,
      tags: [tag()],
    });
  });

  it("normalizes create names and replays only an equivalent UUID-key request", async () => {
    const application = createTagApplication({ database, clock });
    repositories.tag.insert.mockResolvedValue(tag({ name: "Café" }));

    await expect(
      application.createTag(actor, tagId, { name: "  Cafe\u0301  ", colorToken: "coral" }),
    ).resolves.toMatchObject({ created: true, value: { id: tagId, name: "Café" } });
    expect(repositories.tag.lockNameMutations).toHaveBeenCalledWith(userId, transaction);
    expect(repositories.tag.insert).toHaveBeenCalledWith(
      { id: tagId, userId, name: "Café", colorToken: "coral", now },
      transaction,
    );

    repositories.tag.lockById.mockResolvedValue(tag({ name: "Café" }));
    await expect(
      application.createTag(actor, tagId, { name: "Cafe\u0301", colorToken: "coral" }),
    ).resolves.toMatchObject({ created: false, value: { id: tagId, name: "Café" } });
    expect(repositories.tag.insert).toHaveBeenCalledTimes(1);

    await expect(
      application.createTag(actor, tagId, { name: "Different", colorToken: "coral" }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: undefined });
  });

  it("serializes NFKC-equivalent uniqueness for create, rename, and restore", async () => {
    const application = createTagApplication({ database, clock });
    repositories.tag.findActiveEquivalentName.mockResolvedValue(tag({ id: secondTagId, name: "Focus" }));

    await expect(
      application.createTag(actor, tagId, { name: "Ｆｏｃｕｓ", colorToken: "coral" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    repositories.tag.lockById.mockResolvedValue(tag());
    await expect(
      application.updateTag(actor, tagId, {
        expectedVersion: 1,
        patch: { name: "Ｆｏｃｕｓ" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repositories.tag.update).not.toHaveBeenCalled();

    repositories.tag.lockById.mockResolvedValue(tag({ deletedAt: now }));
    await expect(application.restoreTag(actor, tagId, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
      currentVersion: undefined,
    });
    expect(repositories.tag.restore).not.toHaveBeenCalled();
    expect(repositories.tag.lockNameMutations).toHaveBeenCalledTimes(3);
  });

  it("keeps maximal Unicode tag cursors compact and resolves the exact repository sort key", async () => {
    const application = createTagApplication({ database, clock });
    repositories.tag.listActive.mockResolvedValueOnce([
      tag({ name: "🚀".repeat(120) }),
      tag({ id: secondTagId, name: "Launch" }),
    ]);

    const first = await application.listTags(actor, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.nextCursor!.length).toBeLessThanOrEqual(512);
    expect(tagPageSchema.parse(first)).toEqual(first);

    repositories.tag.listActive.mockResolvedValueOnce([]);
    await application.listTags(actor, { limit: 1, cursor: first.nextCursor! });
    expect(repositories.tag.resolveActivePageCursor).toHaveBeenCalledWith(userId, tagId);
    expect(repositories.tag.listActive).toHaveBeenLastCalledWith(userId, {
      limit: 2,
      after: { normalizedName: "focus", id: tagId },
    });

    await expect(application.listTags(actor, { limit: 1, cursor: "bm90LWpzb24" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      currentVersion: undefined,
    });
    expect(repositories.tag.listActive).toHaveBeenCalledTimes(2);
  });

  it("rejects a well-formed cursor whose owned active anchor no longer exists", async () => {
    const application = createTagApplication({ database, clock });
    repositories.tag.listActive.mockResolvedValueOnce([tag(), tag({ id: secondTagId })]);
    const { nextCursor } = await application.listTags(actor, { limit: 1 });
    repositories.tag.resolveActivePageCursor.mockResolvedValueOnce(null);

    await expect(application.listTags(actor, { limit: 1, cursor: nextCursor! })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      currentVersion: undefined,
    });
    expect(repositories.tag.listActive).toHaveBeenCalledTimes(1);
  });

  it("supports get, update, delete, and restore without leaking stale resource data", async () => {
    const application = createTagApplication({ database, clock });
    await expect(application.getTag(actor, tagId)).resolves.toMatchObject({ id: tagId });

    repositories.tag.lockById.mockResolvedValue(tag({ version: 4 }));
    await expect(
      application.updateTag(actor, tagId, { expectedVersion: 1, patch: { colorToken: "sky" } }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 4 });
    await expect(application.deleteTag(actor, tagId, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
      currentVersion: 4,
    });
    await expect(application.restoreTag(actor, tagId, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
      currentVersion: undefined,
    });
    expect(repositories.tag.update).not.toHaveBeenCalled();
    expect(repositories.tag.softDelete).not.toHaveBeenCalled();

    repositories.tag.lockById.mockResolvedValue(tag());
    repositories.tag.lockNameMutations.mockClear();
    await expect(
      application.updateTag(actor, tagId, { expectedVersion: 1, patch: { colorToken: "sky" } }),
    ).resolves.toMatchObject({ version: 2 });
    expect(repositories.tag.lockNameMutations).not.toHaveBeenCalled();

    await expect(application.deleteTag(actor, tagId, { expectedVersion: 1 })).resolves.toMatchObject({
      deletedAt: now.toISOString(),
    });
    repositories.tag.lockById.mockResolvedValue(tag({ deletedAt: now }));
    await expect(application.restoreTag(actor, tagId, { expectedVersion: 1 })).resolves.toMatchObject({
      deletedAt: null,
      version: 2,
    });
  });

  it("maps atomic task-tag outcomes to version refs and non-leaking conflicts", async () => {
    const application = createTagApplication({ database, clock });

    await expect(
      application.replaceTaskTags(actor, taskId, { expectedVersion: 1, tagIds: [tagId] }),
    ).resolves.toEqual({
      task: { id: taskId, version: 2 },
      tags: [
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
    });
    expect(repositories.tag.replaceForActiveTask).toHaveBeenCalledWith(
      { userId, taskId, expectedTaskVersion: 1, tagIds: [tagId], now },
      transaction,
    );

    repositories.tag.replaceForActiveTask.mockResolvedValueOnce({ kind: "task_not_found" });
    await expect(
      application.replaceTaskTags(actor, taskId, { expectedVersion: 1, tagIds: [] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", currentVersion: undefined });

    repositories.tag.replaceForActiveTask.mockResolvedValueOnce({ kind: "task_stale", currentVersion: 7 });
    await expect(
      application.replaceTaskTags(actor, taskId, { expectedVersion: 1, tagIds: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 7 });

    repositories.tag.replaceForActiveTask.mockResolvedValueOnce({ kind: "tag_conflict" });
    await expect(
      application.replaceTaskTags(actor, taskId, { expectedVersion: 1, tagIds: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: undefined });
  });
});
