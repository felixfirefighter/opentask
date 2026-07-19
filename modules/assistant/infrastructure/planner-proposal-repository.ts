import { and, eq, lte } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";

import type { createAssistantSchema } from "./schema";

type PlannerProposalTable = ReturnType<typeof createAssistantSchema>["plannerProposals"];
type PlannerProposalStatus = "pending" | "applied" | "expired" | "rejected";

export function createPlannerProposalRepository(
  table: PlannerProposalTable,
  defaultExecutor: DatabaseExecutor = getDatabase(),
) {
  return {
    async insert(
      record: typeof table.$inferInsert,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<typeof table.$inferSelect> {
      const [inserted] = await executor.insert(table).values(record).returning();
      if (!inserted) throw new Error("Planner proposal insert returned no row.");
      return inserted;
    },

    async findOwned(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<typeof table.$inferSelect | null> {
      const [record] = await executor
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.id, id)))
        .limit(1);
      return record ?? null;
    },

    async transitionOwned(
      userId: string,
      id: string,
      expectedStatus: PlannerProposalStatus,
      nextStatus: PlannerProposalStatus,
      appliedAt: Date | null,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<typeof table.$inferSelect | null> {
      if ((nextStatus === "applied") !== (appliedAt !== null)) {
        throw new RangeError("Applied proposal status and timestamp must change together.");
      }
      const [record] = await executor
        .update(table)
        .set({ status: nextStatus, appliedAt })
        .where(and(eq(table.userId, userId), eq(table.id, id), eq(table.status, expectedStatus)))
        .returning();
      return record ?? null;
    },

    async expireOwned(
      userId: string,
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<number> {
      const records = await executor
        .update(table)
        .set({ status: "expired", appliedAt: null })
        .where(and(eq(table.userId, userId), eq(table.status, "pending"), lte(table.expiresAt, now)))
        .returning({ id: table.id });
      return records.length;
    },
  };
}
