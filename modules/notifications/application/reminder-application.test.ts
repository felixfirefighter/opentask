import { describe, expect, it } from "vitest";

import type { Database, DatabaseExecutor } from "@/shared/db/client";

import { createReminderApplication } from "./reminder-application";
import type { TaskReminderRepository } from "./notification-ports";
import type { NotificationReconciler } from "./notification-reconciler";
import type { TaskReminderRecord } from "./notification-records";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  reminder: "33333333-3333-4333-8333-333333333333",
};
const now = new Date("2026-07-21T00:00:00.000Z");
const executor = {} as DatabaseExecutor;

describe("reminder application version contract", () => {
  it("supports create replay and versioned replace/remove while rejecting stale mutations", async () => {
    let stored: TaskReminderRecord | null = null;
    let producerChecks = 0;
    let reconciliations = 0;
    const application = createReminderApplication({
      database: fakeDatabase(),
      clock: { now: () => now },
      tasks: {
        async readOwned(actor, input) {
          expect(actor.userId).toBe(ids.user);
          expect(input.taskId).toBe(ids.task);
          return {
            taskId: ids.task,
            status: "open",
            deleted: false,
            recurring: false,
            relativeStart: null,
          };
        },
      },
      reminders: reminderRepository(
        () => stored,
        (next) => {
          stored = next;
        },
      ),
      reconciler: reconciler(
        () => {
          producerChecks += 1;
        },
        () => {
          reconciliations += 1;
        },
      ),
    });
    const initial = {
      id: ids.reminder,
      taskId: ids.task,
      expectedVersion: null,
      enabled: true,
      spec: {
        kind: "absolute" as const,
        remindAt: "2026-07-21T01:00:00.000Z",
        offsetMinutes: null,
      },
    };

    await expect(application.setTaskReminder({ userId: ids.user }, initial)).resolves.toMatchObject({
      id: ids.reminder,
      version: 1,
    });
    await expect(application.setTaskReminder({ userId: ids.user }, initial)).resolves.toMatchObject({
      id: ids.reminder,
      version: 1,
    });
    expect(reconciliations).toBe(1);

    await expect(
      application.setTaskReminder(
        { userId: ids.user },
        {
          ...initial,
          expectedVersion: 2,
          spec: { ...initial.spec, remindAt: "2026-07-21T02:00:00.000Z" },
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

    const replacement = {
      ...initial,
      expectedVersion: 1,
      spec: { ...initial.spec, remindAt: "2026-07-21T02:00:00.000Z" },
    };
    await expect(application.setTaskReminder({ userId: ids.user }, replacement)).resolves.toMatchObject({
      version: 2,
    });
    expect(reconciliations).toBe(2);
    await expect(application.setTaskReminder({ userId: ids.user }, replacement)).resolves.toMatchObject({
      version: 2,
    });
    expect(reconciliations).toBe(2);

    await expect(
      application.removeTaskReminder({ userId: ids.user }, { taskId: ids.task, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      application.removeTaskReminder({ userId: ids.user }, { taskId: ids.task, expectedVersion: 2 }),
    ).resolves.toMatchObject({ version: 2 });
    expect(stored).toBeNull();
    await expect(
      application.removeTaskReminder({ userId: ids.user }, { taskId: ids.task, expectedVersion: 2 }),
    ).resolves.toBeNull();
    expect(producerChecks).toBe(5);
  });
});

function fakeDatabase(): Database {
  return {
    transaction: async (work: (transaction: DatabaseExecutor) => Promise<unknown>) => work(executor),
  } as unknown as Database;
}

function reminderRepository(
  read: () => TaskReminderRecord | null,
  write: (record: TaskReminderRecord | null) => void,
): TaskReminderRepository {
  return {
    findByTask: async (userId, taskId) => {
      const current = read();
      return current?.userId === userId && current.taskId === taskId ? current : null;
    },
    findById: async (userId, reminderId) => {
      const current = read();
      return current?.userId === userId && current.id === reminderId ? current : null;
    },
    async insert(input) {
      if (read()) return null;
      const inserted: TaskReminderRecord = {
        ...input,
        version: 1,
        createdAt: input.now,
        updatedAt: input.now,
      };
      write(inserted);
      return inserted;
    },
    async replace(input) {
      const current = read();
      if (!current || current.userId !== input.userId || current.version !== input.expectedVersion)
        return null;
      const replaced: TaskReminderRecord = {
        ...current,
        kind: input.kind,
        remindAt: input.remindAt,
        offsetMinutes: input.offsetMinutes,
        enabled: input.enabled,
        version: current.version + 1,
        updatedAt: input.now,
      };
      write(replaced);
      return replaced;
    },
    async remove(userId, taskId, expectedVersion) {
      const current = read();
      if (
        !current ||
        current.userId !== userId ||
        current.taskId !== taskId ||
        current.version !== expectedVersion
      ) {
        return null;
      }
      write(null);
      return current;
    },
    listRecoveryPage: async () => (read() ? [read()!] : []),
  };
}

function reconciler(onEnsure: () => void, onReconcile: () => void): NotificationReconciler {
  return {
    async ensureProducer() {
      onEnsure();
    },
    async prepare() {},
    async reconcile() {},
    async reconcileOne(actor, taskId) {
      expect(actor.userId).toBe(ids.user);
      expect(taskId).toBe(ids.task);
      onReconcile();
    },
    async applyRecurrenceResolution() {},
  };
}
