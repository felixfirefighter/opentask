import { describe, expect, it, vi } from "vitest";

import type { Database, DatabaseTransaction } from "@/shared/db/client";

import { ReminderProducerPreparationRequiredError } from "./contracts/task-reminder-contract";
import { runReminderRelevantTaskTransaction } from "./reminder-relevant-transaction";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const transaction = { kind: "task-transaction" } as unknown as DatabaseTransaction;

describe("reminder-relevant task transaction", () => {
  it("rolls back, prepares a concurrently discovered owner, and retries exactly once", async () => {
    const database = {
      transaction: vi.fn(async (work: (value: DatabaseTransaction) => Promise<unknown>) => work(transaction)),
    } as unknown as Database;
    const prepare = vi.fn(async () => undefined);
    const reconcile = vi
      .fn()
      .mockRejectedValueOnce(new ReminderProducerPreparationRequiredError([taskId]))
      .mockResolvedValueOnce(undefined);
    const execute = vi.fn(async () => ({
      value: "committed",
      change: { taskIds: [taskId], reason: "schedule_changed" as const },
    }));

    await expect(
      runReminderRelevantTaskTransaction({
        actor,
        database,
        prepareTaskIds: [taskId],
        reconciler: { prepare, reconcile, applyRecurrenceResolution: vi.fn() },
        execute,
      }),
    ).resolves.toBe("committed");

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(database.transaction).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("does not reconcile a response-lost replay or retry a second preparation marker", async () => {
    const database = {
      transaction: vi.fn(async (work: (value: DatabaseTransaction) => Promise<unknown>) => work(transaction)),
    } as unknown as Database;
    const reconcile = vi.fn();
    await expect(
      runReminderRelevantTaskTransaction({
        actor,
        database,
        prepareTaskIds: [taskId],
        reconciler: {
          prepare: vi.fn(),
          reconcile,
          applyRecurrenceResolution: vi.fn(),
        },
        execute: async () => ({ value: "replay", change: null }),
      }),
    ).resolves.toBe("replay");
    expect(reconcile).not.toHaveBeenCalled();

    const marker = new ReminderProducerPreparationRequiredError([taskId]);
    await expect(
      runReminderRelevantTaskTransaction({
        actor,
        database,
        prepareTaskIds: [taskId],
        reconciler: {
          prepare: vi.fn(),
          reconcile: vi.fn(async () => {
            throw marker;
          }),
          applyRecurrenceResolution: vi.fn(),
        },
        execute: async () => ({
          value: "never",
          change: { taskIds: [taskId], reason: "obsolete" },
        }),
      }),
    ).rejects.toBe(marker);
  });
});
