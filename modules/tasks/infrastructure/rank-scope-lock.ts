import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";

export async function lockRankScope(
  executor: DatabaseExecutor,
  scope: readonly [string, ...string[]],
): Promise<void> {
  const key = `omplish:tasks:rank:${scope.join(":")}`;
  await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export async function lockRankScopes(
  executor: DatabaseExecutor,
  scopes: readonly (readonly [string, ...string[]])[],
): Promise<void> {
  const uniqueScopes = new Map(scopes.map((scope) => [scope.join(":"), scope]));
  for (const [, scope] of [...uniqueScopes].sort(([left], [right]) => compareOrdinal(left, right))) {
    await lockRankScope(executor, scope);
  }
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
