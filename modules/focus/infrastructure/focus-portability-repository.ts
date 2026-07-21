import { asc, and, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export function createFocusPortabilityRepository(defaultExecutor: DatabaseExecutor) {
  return {
    readOwned(userId: string, executor: DatabaseExecutor = defaultExecutor) {
      return executor
        .select()
        .from(schema.focusSessions)
        .where(
          and(
            eq(schema.focusSessions.userId, userId),
            eq(schema.focusSessions.kind, "focus"),
            eq(schema.focusSessions.state, "completed"),
          ),
        )
        .orderBy(asc(schema.focusSessions.id));
    },
  } as const;
}
