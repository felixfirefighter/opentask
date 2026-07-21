import { eq } from "drizzle-orm";

import type { DatabaseTransaction } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type DemoNotificationFixture = Readonly<{
  reminder: Readonly<{
    id: string;
    taskId: string;
    kind: "absolute";
    remindAt: Date;
    offsetMinutes: null;
    enabled: true;
    version: 1;
  }>;
  resetAt: Date;
}>;

export function createDemoNotificationRepository() {
  return {
    async replaceOwnedDataset(
      userId: string,
      fixture: DemoNotificationFixture,
      transaction: DatabaseTransaction,
    ): Promise<void> {
      await transaction
        .delete(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.userId, userId));
      await transaction.delete(schema.taskReminders).where(eq(schema.taskReminders.userId, userId));
      await transaction.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
      await transaction.insert(schema.taskReminders).values({
        ...fixture.reminder,
        userId,
        createdAt: fixture.resetAt,
        updatedAt: fixture.resetAt,
      });
    },
  };
}
