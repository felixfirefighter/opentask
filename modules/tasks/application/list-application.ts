import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  createRegularListRequestSchema,
  deleteRegularListRequestSchema,
  entityIdSchema,
  moveRegularListRequestSchema,
  regularListQuerySchema,
  restoreRegularListRequestSchema,
  updateRegularListRequestSchema,
  type CreateRegularListRequest,
  type DeleteRegularListRequest,
  type MoveRegularListRequest,
  type RegularListDto,
  type RegularListPage,
  type RegularListQuery,
  type UpdateRegularListRequest,
} from "./contracts";
import type { CreateResult } from "./folder-application";
import { decodeRankCursor } from "./page-cursor";
import { planLockedRank, siblingRebalance } from "./rank-operation";
import {
  assertMutableRegularList,
  assertRegularListCreationAllowed,
  assertRestorableRegularList,
} from "./regular-list-policy";
import { effectiveFolderId, mapRegularList, mapRegularListPage } from "./regular-list-projection";
import { staleTaskResource, taskConflict, taskResourceNotFound } from "./task-errors";
import { normalizeListName } from "../domain/task-text";
import { createFolderRepository } from "../infrastructure/folder-repository";
import { createTaskRepository } from "../infrastructure/task-repository";
import { lockRankScopes } from "../infrastructure/rank-scope-lock";
import { createTaskListRepository, type StoredTaskList } from "../infrastructure/task-list-repository";

export function createListApplication({ database, clock }: { database: Database; clock: Clock }) {
  const repository = createTaskListRepository(database);
  const folderRepository = createFolderRepository(database);
  const taskRepository = createTaskRepository(database);

  return {
    async listRegularLists(actor: AuthenticatedActor, rawQuery: RegularListQuery): Promise<RegularListPage> {
      const query = regularListQuerySchema.parse(rawQuery);
      const after = decodeRankCursor(query.cursor);
      const rows = await repository.listActiveRegular(actor.userId, {
        limit: query.limit + 1,
        ...(after ? { after } : {}),
      });
      return mapRegularListPage(rows, query.limit);
    },

    async getRegularList(actor: AuthenticatedActor, rawListId: string): Promise<RegularListDto> {
      const listId = entityIdSchema.parse(rawListId);
      const list = await repository.findRegularById(actor.userId, listId);
      if (!list) throw taskResourceNotFound();
      return mapRegularList(list, await effectiveFolderId(actor.userId, list, database));
    },

    async createRegularList(
      actor: AuthenticatedActor,
      rawResourceId: string,
      rawInput: CreateRegularListRequest,
    ): Promise<CreateResult<RegularListDto>> {
      const input = createRegularListRequestSchema.parse(rawInput);
      const resourceId = entityIdSchema.parse(rawResourceId);
      const name = normalizeListName(input.name);
      assertRegularListCreationAllowed();
      return database.transaction(async (transaction) => {
        const replay = await repository.lockById(actor.userId, resourceId, transaction);
        if (replay) return listReplay(replay, name, input.colorToken, input.folderId, transaction);
        await lockActiveFolder(actor.userId, input.folderId, transaction);
        const plan = await planLockedRank(
          transaction,
          listRankScope(actor.userId, input.folderId),
          () => repository.listActiveRanks(actor.userId, input.folderId, transaction),
          resourceId,
          input.placement,
        );
        const existing = await repository.lockById(actor.userId, resourceId, transaction);
        if (existing) return listReplay(existing, name, input.colorToken, input.folderId, transaction);

        const now = clock.now();
        const rebalance = siblingRebalance(plan, resourceId);
        if (rebalance.length > 0) {
          await repository.rewriteRanks(actor.userId, input.folderId, rebalance, now, transaction);
        }
        const created = await repository.insertRegular(
          {
            id: resourceId,
            userId: actor.userId,
            folderId: input.folderId,
            name,
            colorToken: input.colorToken,
            rank: plan.rank,
            now,
          },
          transaction,
        );
        if (!created) throw listIdempotencyConflict();
        return {
          created: true,
          value: mapRegularList(created, await effectiveFolderId(actor.userId, created, transaction)),
        };
      });
    },

    async updateRegularList(
      actor: AuthenticatedActor,
      rawListId: string,
      rawInput: UpdateRegularListRequest,
    ): Promise<RegularListDto> {
      const input = updateRegularListRequestSchema.parse(rawInput);
      const listId = entityIdSchema.parse(rawListId);
      const patch = {
        ...(input.patch.name === undefined ? {} : { name: normalizeListName(input.patch.name) }),
        ...(input.patch.colorToken === undefined ? {} : { colorToken: input.patch.colorToken }),
      };
      return database.transaction(async (transaction) => {
        const current = await repository.lockById(actor.userId, listId, transaction);
        assertMutableRegularList(current, input.expectedVersion, "update");
        const updated = await repository.updateRegular(
          {
            userId: actor.userId,
            id: listId,
            expectedVersion: input.expectedVersion,
            patch,
            now: clock.now(),
          },
          transaction,
        );
        if (!updated) throw staleTaskResource(current.version);
        return mapRegularList(updated, await effectiveFolderId(actor.userId, updated, transaction));
      });
    },

    async moveRegularList(
      actor: AuthenticatedActor,
      rawListId: string,
      rawInput: MoveRegularListRequest,
    ): Promise<RegularListDto> {
      const input = moveRegularListRequestSchema.parse(rawInput);
      const listId = entityIdSchema.parse(rawListId);
      return database.transaction(async (transaction) => {
        await lockActiveFolder(actor.userId, input.folderId, transaction);
        const observed = await repository.findRegularById(actor.userId, listId, transaction);
        if (!observed) throw taskResourceNotFound();
        await lockRankScopes(transaction, [
          listRankScope(actor.userId, observed.folderId),
          listRankScope(actor.userId, input.folderId),
        ]);
        const plan = await planLockedRank(
          transaction,
          listRankScope(actor.userId, input.folderId),
          () => repository.listActiveRanks(actor.userId, input.folderId, transaction),
          listId,
          input.placement,
        );
        const current = await repository.lockById(actor.userId, listId, transaction);
        assertMutableRegularList(current, input.expectedVersion, "move");
        const now = clock.now();
        const rebalance = siblingRebalance(plan, listId);
        if (rebalance.length > 0) {
          await repository.rewriteRanks(actor.userId, input.folderId, rebalance, now, transaction);
        }
        const updated = await repository.moveRegular(
          {
            userId: actor.userId,
            id: listId,
            expectedVersion: input.expectedVersion,
            folderId: input.folderId,
            rank: plan.rank,
            now,
          },
          transaction,
        );
        if (!updated) throw staleTaskResource(current.version);
        return mapRegularList(updated, input.folderId);
      });
    },

    async deleteRegularList(
      actor: AuthenticatedActor,
      rawListId: string,
      rawInput: DeleteRegularListRequest,
    ): Promise<RegularListDto> {
      const input = deleteRegularListRequestSchema.parse(rawInput);
      const listId = entityIdSchema.parse(rawListId);
      return database.transaction(async (transaction) => {
        const lockedLists = new Map<string, StoredTaskList | null>();
        const lockIds = [
          ...new Set([listId, ...(input.moveTasksToListId ? [input.moveTasksToListId] : [])]),
        ].sort();
        for (const id of lockIds) {
          lockedLists.set(id, await repository.lockById(actor.userId, id, transaction));
        }
        const current = lockedLists.get(listId) ?? null;
        assertMutableRegularList(current, input.expectedVersion, "soft-delete");
        const activeTaskCount = await taskRepository.countActiveByList(actor.userId, listId, transaction);
        const now = clock.now();

        if (activeTaskCount > 0) {
          const destinationId = input.moveTasksToListId;
          if (!destinationId || destinationId === listId) {
            throw taskConflict("Choose a different active list before deleting this list.", current.version);
          }
          const destination = lockedLists.get(destinationId) ?? null;
          if (!destination || destination.deletedAt !== null) throw taskResourceNotFound();
          await taskRepository.moveAllActiveTaskTreesBetweenLists(
            {
              userId: actor.userId,
              sourceListId: listId,
              destinationListId: destinationId,
              now,
            },
            transaction,
          );
          if ((await taskRepository.countActiveByList(actor.userId, listId, transaction)) !== 0) {
            throw taskConflict("Tasks changed while this list was being deleted.", current.version);
          }
        }

        const deleted = await repository.softDeleteRegular(
          { userId: actor.userId, id: listId, expectedVersion: input.expectedVersion, now },
          transaction,
        );
        if (!deleted) throw staleTaskResource(current.version);
        return mapRegularList(deleted, await effectiveFolderId(actor.userId, deleted, transaction));
      });
    },

    async restoreRegularList(
      actor: AuthenticatedActor,
      rawListId: string,
      rawInput: { expectedVersion: number },
    ): Promise<RegularListDto> {
      const input = restoreRegularListRequestSchema.parse(rawInput);
      const listId = entityIdSchema.parse(rawListId);
      return database.transaction(async (transaction) => {
        const current = await repository.lockById(actor.userId, listId, transaction);
        assertRestorableRegularList(current, input.expectedVersion);
        const restored = await repository.restoreRegular(
          { userId: actor.userId, id: listId, expectedVersion: input.expectedVersion, now: clock.now() },
          transaction,
        );
        if (!restored) throw staleTaskResource(current.version);
        return mapRegularList(restored, await effectiveFolderId(actor.userId, restored, transaction));
      });
    },
  };

  async function lockActiveFolder(
    userId: string,
    folderId: string | null,
    executor: DatabaseExecutor,
  ): Promise<void> {
    if (folderId === null) return;
    const folder = await folderRepository.lockById(userId, folderId, executor);
    if (!folder || folder.deletedAt !== null) throw taskResourceNotFound();
  }

  async function listReplay(
    list: StoredTaskList,
    name: string,
    colorToken: string,
    folderId: string | null,
    executor: DatabaseExecutor,
  ): Promise<CreateResult<RegularListDto>> {
    if (
      list.kind !== "regular" ||
      list.deletedAt !== null ||
      list.name !== name ||
      list.colorToken !== colorToken ||
      list.folderId !== folderId
    ) {
      throw listIdempotencyConflict();
    }
    return {
      created: false,
      value: mapRegularList(list, await effectiveFolderId(list.userId, list, executor)),
    };
  }
}

function listRankScope(userId: string, folderId: string | null): readonly [string, ...string[]] {
  return ["lists", userId, folderId ?? "unfiled"];
}

function listIdempotencyConflict() {
  return taskConflict("This create key was already used for different list data.");
}
