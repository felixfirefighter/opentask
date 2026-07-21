import { describe, expect, it, vi } from "vitest";

import type { DatabaseTransaction } from "@/shared/db/client";

import { createPortabilityApplication } from "./export-application";
import { buildUserExportFilename } from "./export-filename";
import { userExportEnvelopeSchema } from "./export-envelope-contract";

const userId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const instant = "2026-07-19T10:20:30.000Z";

describe("user export application", () => {
  it("composes one versioned relationship-safe document inside one snapshot", async () => {
    const transaction = {} as DatabaseTransaction;
    const readIdentity = vi.fn(async () => identitySource());
    const readTasks = vi.fn(async () => tasksSource());
    const readProposals = vi.fn(async () => []);
    const readCompanion = vi.fn(async () => companionSource());
    const readPrompts = vi.fn(async () => []);
    const application = createPortabilityApplication({
      snapshot: { run: (work) => work(transaction) },
      clock: { now: () => new Date(instant) },
      readIdentity,
      readTasks,
      readProposals,
      readCompanion,
      readPrompts,
    });

    const envelope = await application.exportUserData({ userId });

    expect(userExportEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(envelope).toMatchObject({
      schemaVersion: 2,
      exportedAt: instant,
      identity: { schemaVersion: 1, profile: { id: userId } },
      tasks: { schemaVersion: 1, tasks: [{ id: taskId }] },
      assistant: { schemaVersion: 1, proposals: [] },
      companion: { schemaVersion: 1, profile: null, xpEvents: [], summary: null, memories: [] },
      prompts: { schemaVersion: 1, prompts: [] },
    });
    for (const reader of [readIdentity, readTasks, readProposals, readCompanion, readPrompts]) {
      expect(reader).toHaveBeenCalledWith({ userId }, transaction);
    }
    expect(buildUserExportFilename(envelope.exportedAt)).toBe("omplish-export-2026-07-19.json");
  });

  it("rejects wrong-owner, broken relationships, and unexpected secret-shaped fields", async () => {
    await expect(
      createExport({
        identity: { ...identitySource(), profile: { ...identitySource().profile, id: listId } },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(
      createExport({ tasks: { ...tasksSource(), taskTags: [{ taskId, tagId: listId }] } }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(
      createExport({ identity: { ...identitySource(), password: "never-export-this" } }),
    ).rejects.toBeDefined();
  });
});

function createExport(overrides: { identity?: unknown; tasks?: unknown }) {
  return createPortabilityApplication({
    snapshot: { run: (work) => work({} as DatabaseTransaction) },
    clock: { now: () => new Date(instant) },
    readIdentity: async () => overrides.identity ?? identitySource(),
    readTasks: async () => overrides.tasks ?? tasksSource(),
    readProposals: async () => [],
    readCompanion: async () => companionSource(),
    readPrompts: async () => [],
  }).exportUserData({ userId });
}

function companionSource() {
  return { profile: null, xpEvents: [], summary: null, memories: [] } as const;
}

function identitySource() {
  return {
    profile: {
      id: userId,
      name: "Export owner",
      email: "owner@example.test",
      createdAt: instant,
      updatedAt: instant,
    },
    preferences: {
      schemaVersion: 2,
      version: 1,
      timezone: "Asia/Singapore",
      weekStart: 1,
      hourCycle: "h23",
      theme: "system",
      reducedMotion: false,
      onboarding: { complete: false, completedAt: null, goals: [], checkins: [] },
      createdAt: instant,
      updatedAt: instant,
    },
  } as const;
}

function tasksSource() {
  return {
    folders: [],
    lists: [
      {
        id: listId,
        folderId: null,
        name: "Inbox",
        colorToken: "slate",
        rank: "a0",
        kind: "inbox",
        version: 1,
        createdAt: instant,
        updatedAt: instant,
        deletedAt: null,
      },
    ],
    sections: [],
    tasks: [
      {
        id: taskId,
        listId,
        sectionId: null,
        parentTaskId: null,
        title: "Portable task",
        descriptionMd: "",
        status: "open",
        priority: "none",
        rank: "a0",
        statusChangedAt: instant,
        version: 1,
        createdAt: instant,
        updatedAt: instant,
        deletedAt: null,
      },
    ],
    schedules: [],
    checklistItems: [],
    tags: [],
    taskTags: [],
  } as const;
}
