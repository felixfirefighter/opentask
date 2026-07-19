import { and, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export function createPortableIdentityRepository(defaultExecutor: DatabaseExecutor) {
  return {
    async readOwned(userId: string, executor: DatabaseExecutor = defaultExecutor) {
      const [row] = await executor
        .select({ user: schema.user, preferences: schema.userPreferences })
        .from(schema.user)
        .innerJoin(
          schema.userPreferences,
          and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.userId, schema.user.id)),
        )
        .where(eq(schema.user.id, userId))
        .limit(1);
      return row ?? null;
    },
  } as const;
}
