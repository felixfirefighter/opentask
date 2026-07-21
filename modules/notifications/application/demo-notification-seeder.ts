import type { Database, DatabaseTransaction } from "@/shared/db/client";

import { notificationIdSchema } from "./contracts";
import { buildDemoNotificationFixture } from "./demo-notification-fixture";
import { createDemoNotificationRepository } from "../infrastructure/demo-notification-repository";

export function createDemoNotificationSeeder({ database }: { database: Database }) {
  const repository = createDemoNotificationRepository();

  return {
    async reset(rawUserId: string, resetAt: Date, existingTransaction?: DatabaseTransaction): Promise<void> {
      const userId = notificationIdSchema.parse(rawUserId);
      const fixture = buildDemoNotificationFixture(resetAt);
      const replace = (transaction: DatabaseTransaction) =>
        repository.replaceOwnedDataset(userId, fixture, transaction);

      if (existingTransaction) await replace(existingTransaction);
      else await database.transaction(replace);
    },
  };
}
