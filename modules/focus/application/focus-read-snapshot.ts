import type { Database, DatabaseTransaction } from "@/shared/db/client";

export type FocusReadSnapshot = Readonly<{
  run<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
}>;

export function createPostgresFocusReadSnapshot(database: Database): FocusReadSnapshot {
  return {
    run: <T>(work: (transaction: DatabaseTransaction) => Promise<T>) =>
      database.transaction(work, { isolationLevel: "repeatable read", accessMode: "read only" }),
  };
}
