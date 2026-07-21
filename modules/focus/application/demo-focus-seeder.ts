import type { DatabaseTransaction } from "@/shared/db/client";

import { buildDemoFocusFixture } from "./demo-focus-fixture";
import { createDemoFocusRepository } from "../infrastructure/demo-focus-repository";

export function createDemoFocusSeeder({
  links,
}: Readonly<{
  links: Readonly<{ taskId: string; habitId: string }>;
}>) {
  const repository = createDemoFocusRepository();
  return {
    async clear(userId: string, transaction: DatabaseTransaction): Promise<void> {
      await repository.lockOwner(userId, transaction);
      await repository.clearOwned(userId, transaction);
    },

    async seed(userId: string, resetAt: Date, transaction: DatabaseTransaction): Promise<void> {
      await repository.seedOwned(userId, resetAt, buildDemoFocusFixture(resetAt, links), transaction);
    },
  } as const;
}
