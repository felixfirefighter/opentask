import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  createChecklistItemRequestSchema,
  deleteChecklistItemRequestSchema,
  entityIdSchema,
  positionChecklistItemRequestSchema,
  updateChecklistItemRequestSchema,
  type ChecklistItemDto,
  type CreateChecklistItemRequest,
  type PositionChecklistItemRequest,
  type UpdateChecklistItemRequest,
} from "./contracts";
import { mapChecklistItem } from "./task-application-support";
import { planLockedRank, siblingRebalance } from "./rank-operation";
import type { RankPlacementPlan } from "./ranked-placement";
import { staleTaskResource, taskConflict, taskResourceNotFound } from "./task-errors";
import { decideChecklistCompletion } from "../domain/checklist-policy";
import { normalizeChecklistTitle } from "../domain/task-text";
import {
  createChecklistRepository,
  type ChecklistWriteResult,
  type StoredChecklistItem,
} from "../infrastructure/checklist-repository";
import { createTaskRepository } from "../infrastructure/task-repository";

export type ChecklistCreateResult = Readonly<{ created: boolean; value: ChecklistItemDto }>;

export function createChecklistApplication({ database, clock }: { database: Database; clock: Clock }) {
  const repository = createChecklistRepository(database);
  const tasks = createTaskRepository(database);

  return {
    async createChecklistItem(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawResourceId: string,
      rawInput: CreateChecklistItemRequest,
    ): Promise<ChecklistCreateResult> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const resourceId = entityIdSchema.parse(rawResourceId);
      const input = createChecklistItemRequestSchema.parse(rawInput);
      const title = normalizeChecklistTitle(input.title);
      return database.transaction(async (transaction) => {
        const replay = await repository.lockById(actor.userId, taskId, resourceId, transaction);
        if (replay) return checklistReplay(replay, title);
        await assertActiveTask(actor.userId, taskId, transaction);
        const plan = await planLockedRank(
          transaction,
          ["checklist", actor.userId, taskId],
          () => repository.listByTask(actor.userId, taskId, transaction),
          resourceId,
          input.placement,
        );
        const existing = await repository.lockById(actor.userId, taskId, resourceId, transaction);
        if (existing) return checklistReplay(existing, title);
        const now = clock.now();
        await applyChecklistRebalance(
          repository,
          actor.userId,
          taskId,
          await repository.listByTask(actor.userId, taskId, transaction),
          plan,
          resourceId,
          now,
          transaction,
        );
        const created = await repository.insert(
          { id: resourceId, userId: actor.userId, taskId, title, rank: plan.rank, now },
          transaction,
        );
        if (!created) {
          const collision = await repository.lockById(actor.userId, taskId, resourceId, transaction);
          if (collision) return checklistReplay(collision, title);
          throw checklistIdempotencyConflict();
        }
        return { created: true, value: mapChecklistItem(created) };
      });
    },

    async updateChecklistItem(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawItemId: string,
      rawInput: UpdateChecklistItemRequest,
    ): Promise<ChecklistItemDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const itemId = entityIdSchema.parse(rawItemId);
      const input = updateChecklistItemRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        await assertActiveTask(actor.userId, taskId, transaction);
        const current = await repository.lockById(actor.userId, taskId, itemId, transaction);
        assertCurrentChecklistItem(current, input.expectedVersion);
        const completion =
          input.patch.isCompleted === undefined
            ? undefined
            : decideChecklistCompletion(current.isCompleted, input.patch.isCompleted).isCompleted;
        const result = await repository.updateDetails(
          {
            userId: actor.userId,
            taskId,
            id: itemId,
            expectedVersion: input.expectedVersion,
            patch: {
              ...(input.patch.title === undefined
                ? {}
                : { title: normalizeChecklistTitle(input.patch.title) }),
              ...(completion === undefined ? {} : { isCompleted: completion }),
            },
            now: clock.now(),
          },
          transaction,
        );
        return mapChecklistItem(requireAppliedChecklist(result));
      });
    },

    async positionChecklistItem(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawItemId: string,
      rawInput: PositionChecklistItemRequest,
    ): Promise<ChecklistItemDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const itemId = entityIdSchema.parse(rawItemId);
      const input = positionChecklistItemRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        await assertActiveTask(actor.userId, taskId, transaction);
        const plan = await planLockedRank(
          transaction,
          ["checklist", actor.userId, taskId],
          () => repository.listByTask(actor.userId, taskId, transaction),
          itemId,
          input.placement,
        );
        const current = await repository.lockById(actor.userId, taskId, itemId, transaction);
        assertCurrentChecklistItem(current, input.expectedVersion);
        const now = clock.now();
        await applyChecklistRebalance(
          repository,
          actor.userId,
          taskId,
          await repository.listByTask(actor.userId, taskId, transaction),
          plan,
          itemId,
          now,
          transaction,
        );
        const result = await repository.updateRank(
          {
            userId: actor.userId,
            taskId,
            id: itemId,
            expectedVersion: input.expectedVersion,
            rank: plan.rank,
            now,
          },
          transaction,
        );
        return mapChecklistItem(requireAppliedChecklist(result));
      });
    },

    async deleteChecklistItem(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawItemId: string,
      rawInput: { expectedVersion: number },
    ): Promise<ChecklistItemDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const itemId = entityIdSchema.parse(rawItemId);
      const input = deleteChecklistItemRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        await assertActiveTask(actor.userId, taskId, transaction);
        const current = await repository.lockById(actor.userId, taskId, itemId, transaction);
        assertCurrentChecklistItem(current, input.expectedVersion);
        return mapChecklistItem(
          requireAppliedChecklist(
            await repository.hardDelete(
              { userId: actor.userId, taskId, id: itemId, expectedVersion: input.expectedVersion },
              transaction,
            ),
          ),
        );
      });
    },
  };

  async function assertActiveTask(userId: string, taskId: string, executor: DatabaseExecutor): Promise<void> {
    const task = await tasks.lockById(userId, taskId, "active", executor);
    if (!task) throw taskResourceNotFound();
  }
}

type ChecklistRepository = ReturnType<typeof createChecklistRepository>;

async function applyChecklistRebalance(
  repository: ChecklistRepository,
  userId: string,
  taskId: string,
  siblings: readonly StoredChecklistItem[],
  plan: RankPlacementPlan,
  targetId: string,
  now: Date,
  executor: DatabaseExecutor,
): Promise<void> {
  const versions = new Map(siblings.map((row) => [row.id, row.version]));
  const updates = siblingRebalance(plan, targetId).map(({ id, rank }) => {
    const expectedVersion = versions.get(id);
    if (expectedVersion === undefined) throw new Error("Rank plan referenced an unknown checklist sibling.");
    return { id, rank, expectedVersion };
  });
  if (updates.length === 0) return;
  for (const result of await repository.rewriteRanks(userId, taskId, updates, now, executor)) {
    requireAppliedChecklist(result);
  }
}

function assertCurrentChecklistItem(
  item: StoredChecklistItem | null,
  expectedVersion: number,
): asserts item is StoredChecklistItem {
  if (!item) throw taskResourceNotFound();
  if (item.version !== expectedVersion) throw staleTaskResource(item.version);
}

function requireAppliedChecklist(result: ChecklistWriteResult): StoredChecklistItem {
  if (result.outcome === "applied") return result.item;
  if (result.outcome === "stale") throw staleTaskResource(result.currentVersion);
  throw taskResourceNotFound();
}

function checklistReplay(item: StoredChecklistItem, title: string): ChecklistCreateResult {
  if (item.title !== title || item.isCompleted) throw checklistIdempotencyConflict();
  return { created: false, value: mapChecklistItem(item) };
}

function checklistIdempotencyConflict() {
  return taskConflict("This create key was already used for different checklist data.");
}
