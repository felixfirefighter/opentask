import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";

import {
  normalizeReminderTaskIds,
  ReminderProducerPreparationRequiredError,
  type ReminderRelevantTaskChange,
  type TaskReminderReconciler,
} from "./contracts/task-reminder-contract";

export type ReminderRelevantTransactionResult<T> = Readonly<{
  value: T;
  change: ReminderRelevantTaskChange | null;
}>;

/**
 * Runs one reminder-relevant task write and performs one bounded producer-preparation retry.
 * The callback must remain deterministic across a serialization retry.
 */
export async function runReminderRelevantTaskTransaction<T>({
  actor,
  database,
  prepareTaskIds,
  reconciler,
  execute,
}: Readonly<{
  actor: AuthenticatedActor;
  database: Database;
  prepareTaskIds: readonly string[];
  reconciler: TaskReminderReconciler;
  execute: (transaction: DatabaseTransaction) => Promise<ReminderRelevantTransactionResult<T>>;
}>): Promise<T> {
  await reconciler.prepare(actor, normalizeReminderTaskIds(prepareTaskIds));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await database.transaction(async (transaction) => {
        const result = await execute(transaction);
        if (result.change) {
          const change = {
            ...result.change,
            taskIds: normalizeReminderTaskIds(result.change.taskIds),
          };
          await reconciler.reconcile(actor, change, transaction);
        }
        return result.value;
      });
    } catch (error) {
      if (!(error instanceof ReminderProducerPreparationRequiredError) || attempt > 0) throw error;
      await reconciler.prepare(actor, error.taskIds);
    }
  }

  throw new Error("Reminder-relevant task transaction exhausted its bounded retry.");
}
