import { createHash, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import type { Database } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";
import type { Clock } from "@/shared/time/clock";

const windowMilliseconds = 60 * 60 * 1000;
const maxEntriesPerWindow = 5;

export function createDemoEntryLimiter(database: Database, clock: Clock) {
  return {
    async consume(clientAddress: string): Promise<boolean> {
      const key = createLimitKey(clientAddress);
      return database.transaction(async (transaction) => {
        // A row lock cannot serialize the first request because no row exists yet.
        // Locking the derived key keeps the initial insert and later increments on
        // one transaction path without storing the client address itself.
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

        const [existing] = await transaction
          .select()
          .from(schema.rateLimit)
          .where(eq(schema.rateLimit.key, key))
          .limit(1);
        const now = clock.now().getTime();

        if (!existing || now - existing.lastRequest >= windowMilliseconds) {
          await transaction
            .insert(schema.rateLimit)
            .values({ id: randomUUID(), key, count: 1, lastRequest: now })
            .onConflictDoUpdate({
              target: schema.rateLimit.key,
              set: { count: 1, lastRequest: now },
            });
          return true;
        }

        if (existing.count >= maxEntriesPerWindow) return false;
        await transaction
          .update(schema.rateLimit)
          .set({ count: existing.count + 1, lastRequest: now })
          .where(eq(schema.rateLimit.id, existing.id));
        return true;
      });
    },
  };
}

function createLimitKey(clientAddress: string): string {
  const digest = createHash("sha256").update(clientAddress).digest("hex");
  return `demo-entry:${digest}`;
}
