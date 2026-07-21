import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { habitIdSchema } from "./contracts";
import { buildDemoHabitFixture } from "./demo-habit-fixture";
import { createDemoHabitRepository } from "../infrastructure/demo-habit-repository";

export function createDemoHabitSeeder({ database, clock }: { database: Database; clock: Clock }) {
  const repository = createDemoHabitRepository();
  return {
    async reset(rawUserId: string, existingTransaction?: DatabaseTransaction): Promise<void> {
      const userId = habitIdSchema.parse(rawUserId);
      const replace = async (transaction: DatabaseTransaction) => {
        await repository.lockOwner(userId, transaction);
        await repository.replaceOwned(userId, buildDemoHabitFixture(clock.now()), transaction);
      };
      if (existingTransaction) await replace(existingTransaction);
      else await database.transaction(replace);
    },
  } as const;
}
