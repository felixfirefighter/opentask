import type { Database, DatabaseTransaction } from "@/shared/db/client";

export type TaskReadSnapshot = Readonly<{
  run<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
}>;

export function createPostgresTaskReadSnapshot(database: Database): TaskReadSnapshot {
  return {
    run: <T>(work: (transaction: DatabaseTransaction) => Promise<T>) =>
      database.transaction(work, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      }),
  };
}
