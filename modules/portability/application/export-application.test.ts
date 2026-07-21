import { describe, expect, it, vi } from "vitest";

import type { DatabaseTransaction } from "@/shared/db/client";

import { createPortabilityApplication } from "./export-application";
import { buildUserExportFilename } from "./export-filename";
import { userExportEnvelopeSchema } from "./export-envelope-contract";

const userId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const reminderId = "55555555-5555-4555-8555-555555555555";
const instant = "2026-07-19T10:20:30.000Z";

describe("user export application", () => {
  it("composes one versioned relationship-safe document inside one snapshot", async () => {
    const transaction = {} as DatabaseTransaction;
    const readIdentity = vi.fn(async () => identitySource());
    const readTasks = vi.fn(async () => tasksSource());
    const readHabits = vi.fn(async () => habitsSource());
    const readFocus = vi.fn(async () => focusSource());
    const readNotifications = vi.fn(async () => notificationsSource());
    const readProposals = vi.fn(async () => []);
    const application = createPortabilityApplication({
      snapshot: { run: (work) => work(transaction) },
      clock: { now: () => new Date(instant) },
      readIdentity,
      readTasks,
      readHabits,
      readFocus,
      readNotifications,
      readProposals,
    });

    const envelope = await application.exportUserData({ userId });

    expect(userExportEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(envelope).toMatchObject({
      schemaVersion: 5,
      exportedAt: instant,
      identity: { schemaVersion: 1, profile: { id: userId } },
      tasks: { schemaVersion: 2, tasks: [{ id: taskId }] },
      habits: { schemaVersion: 1, habits: [] },
      focus: { schemaVersion: 1, sessions: [{ taskId }] },
      notifications: { schemaVersion: 1, reminders: [{ id: reminderId, taskId }] },
      assistant: { schemaVersion: 1, proposals: [] },
    });
    for (const reader of [readIdentity, readTasks, readHabits, readFocus, readNotifications, readProposals]) {
      expect(reader).toHaveBeenCalledWith({ userId }, transaction);
    }
    expect(buildUserExportFilename(envelope.exportedAt)).toBe("opentask-export-2026-07-19.json");
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
      createExport({
        focus: {
          sessions: [
            {
              ...focusSource().sessions[0],
              taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(
      createExport({ identity: { ...identitySource(), password: "never-export-this" } }),
    ).rejects.toBeDefined();
    await expect(
      createExport({
        notifications: {
          reminders: [{ ...notificationsSource().reminders[0], taskId: listId }],
        },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("enforces one reminder per exported task while permitting dormant reminder facts", async () => {
    await expect(
      createExport({
        notifications: {
          reminders: [
            notificationsSource().reminders[0],
            {
              ...notificationsSource().reminders[0],
              id: "66666666-6666-4666-8666-666666666666",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL" });

    const dormantTaskSource = tasksSource();
    const envelope = await createExport({
      tasks: {
        ...dormantTaskSource,
        tasks: [
          {
            ...dormantTaskSource.tasks[0],
            status: "cancelled",
            deletedAt: "2026-07-19T12:20:30.000Z",
          },
        ],
      },
      notifications: {
        reminders: [
          {
            ...notificationsSource().reminders[0],
            spec: { kind: "relative_start", remindAt: null, offsetMinutes: 30 },
          },
        ],
      },
    });

    expect(envelope.notifications.reminders[0]).toMatchObject({
      taskId,
      spec: { kind: "relative_start", offsetMinutes: 30 },
    });
  });

  it("keeps device, PWA, and notification operations outside the portable document", async () => {
    const envelope = await createExport({});

    expect(envelope.schemaVersion).toBe(5);
    expect(Object.keys(envelope)).toEqual([
      "schemaVersion",
      "exportedAt",
      "identity",
      "tasks",
      "habits",
      "focus",
      "notifications",
      "assistant",
    ]);

    const exportedKeys = new Set(allKeys(envelope));
    for (const operationalKey of [
      "cacheName",
      "cacheStorage",
      "deviceId",
      "displayMode",
      "installPrompt",
      "installationId",
      "manifest",
      "pwa",
      "registration",
      "serviceWorker",
      "endpoint",
      "endpointHash",
      "endpointCiphertext",
      "p256dh",
      "p256dhCiphertext",
      "auth",
      "authCiphertext",
      "encryptionKeyVersion",
      "subscriptionId",
      "deliveryId",
      "idempotencyKey",
      "lastErrorCode",
      "vapidPublicKey",
      "vapidPrivateKey",
      "providerResult",
      "jobId",
      "queueName",
    ]) {
      expect(exportedKeys.has(operationalKey)).toBe(false);
    }

    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("/manifest.webmanifest");
    expect(serialized).not.toContain("/sw.js");
    expect(serialized).not.toContain("opentask-static-");
    expect(userExportEnvelopeSchema.safeParse({ ...envelope, pwa: {} }).success).toBe(false);
    expect(userExportEnvelopeSchema.safeParse({ ...envelope, device: {} }).success).toBe(false);
    expect(userExportEnvelopeSchema.safeParse({ ...envelope, cache: {} }).success).toBe(false);
  });
});

function createExport(overrides: {
  identity?: unknown;
  tasks?: unknown;
  habits?: unknown;
  focus?: unknown;
  notifications?: unknown;
}) {
  return createPortabilityApplication({
    snapshot: { run: (work) => work({} as DatabaseTransaction) },
    clock: { now: () => new Date(instant) },
    readIdentity: async () => overrides.identity ?? identitySource(),
    readTasks: async () => overrides.tasks ?? tasksSource(),
    readHabits: async () => overrides.habits ?? habitsSource(),
    readFocus: async () => overrides.focus ?? focusSource(),
    readNotifications: async () => overrides.notifications ?? notificationsSource(),
    readProposals: async () => [],
  }).exportUserData({ userId });
}

function focusSource() {
  return {
    sessions: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        taskId,
        habitId: null,
        mode: "pomodoro",
        accumulatedActiveSeconds: 1_500,
        plannedSeconds: 1_500,
        startedAt: instant,
        endedAt: "2026-07-19T10:45:30.000Z",
        version: 1,
        createdAt: instant,
        updatedAt: "2026-07-19T10:45:30.000Z",
      },
    ],
  } as const;
}

function habitsSource() {
  return { habits: [], schedules: [], logs: [] } as const;
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
      schemaVersion: 1,
      version: 1,
      timezone: "Asia/Singapore",
      weekStart: 1,
      hourCycle: "h23",
      theme: "system",
      reducedMotion: false,
      createdAt: instant,
      updatedAt: instant,
    },
  } as const;
}

function notificationsSource() {
  return {
    reminders: [
      {
        id: reminderId,
        taskId,
        enabled: true,
        version: 2,
        spec: {
          kind: "absolute",
          remindAt: "2026-07-20T10:20:30.000Z",
          offsetMinutes: null,
        },
        createdAt: instant,
        updatedAt: "2026-07-19T11:20:30.000Z",
      },
    ],
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
    recurrenceDefinitions: [],
    occurrenceEvents: [],
    checklistItems: [],
    tags: [],
    taskTags: [],
  } as const;
}

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)]);
}
