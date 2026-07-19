import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { entityIdSchema } from "./contracts";
import { buildDemoDatasetFixture } from "./demo-dataset-fixture";
import { createDemoDatasetRepository } from "../infrastructure/demo-dataset-repository";

export function createDemoDatasetSeeder({ database, clock }: { database: Database; clock: Clock }) {
  const repository = createDemoDatasetRepository();

  return {
    async reset(rawUserId: string, existingTransaction?: DatabaseTransaction): Promise<void> {
      const userId = entityIdSchema.parse(rawUserId);
      const replace = async (transaction: DatabaseTransaction) => {
        const inboxId = await repository.lockAndFindActiveInbox(userId, transaction);
        if (!inboxId) throw new Error("Demo reset requires an active personal Inbox.");

        const fixture = buildDemoDatasetFixture(clock.now(), inboxId);
        await repository.replaceOwnedDataset(userId, fixture, transaction);
      };

      if (existingTransaction) await replace(existingTransaction);
      else await database.transaction(replace);
    },
  };
}
