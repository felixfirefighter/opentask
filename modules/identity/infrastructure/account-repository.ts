import { eq } from "drizzle-orm";

import type { Database } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export function createAccountRepository(database: Database) {
  return {
    async deleteAccount(userId: string): Promise<void> {
      await database.delete(schema.user).where(eq(schema.user.id, userId));
    },
  };
}
