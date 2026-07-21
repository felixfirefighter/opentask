import type { Database, DatabaseTransaction } from "@/shared/db/client";

export type HabitReadSnapshot = Readonly<{
  run<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
}>;

export function createPostgresHabitReadSnapshot(database: Database): HabitReadSnapshot {
  return {
    run: <T>(work: (transaction: DatabaseTransaction) => Promise<T>) =>
      database.transaction(work, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      }),
  };
}
