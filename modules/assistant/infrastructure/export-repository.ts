import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export function createAssistantExportRepository(defaultExecutor: DatabaseExecutor) {
  return {
    readOwned(userId: string, executor: DatabaseExecutor = defaultExecutor) {
      return executor
        .select()
        .from(schema.plannerProposals)
        .where(eq(schema.plannerProposals.userId, userId))
        .orderBy(asc(schema.plannerProposals.id));
    },
  } as const;
}
