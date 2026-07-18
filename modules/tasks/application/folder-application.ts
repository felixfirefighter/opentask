import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  createFolderRequestSchema,
  deleteFolderRequestSchema,
  entityIdSchema,
  folderDtoSchema,
  folderPageSchema,
  folderQuerySchema,
  positionFolderRequestSchema,
  restoreFolderRequestSchema,
  updateFolderRequestSchema,
  type CreateFolderRequest,
  type FolderDto,
  type FolderPage,
  type FolderQuery,
  type PositionFolderRequest,
  type UpdateFolderRequest,
} from "./contracts";
import { decodeRankCursor, pageFromRows } from "./page-cursor";
import { planLockedRank, siblingRebalance } from "./rank-operation";
import { staleTaskResource, taskConflict, taskResourceNotFound } from "./task-errors";
import { normalizeFolderName } from "../domain/task-text";
import { createFolderRepository, type StoredFolder } from "../infrastructure/folder-repository";

export type CreateResult<T> = Readonly<{ created: boolean; value: T }>;

export function createFolderApplication({ database, clock }: { database: Database; clock: Clock }) {
  const repository = createFolderRepository(database);

  return {
    async listFolders(actor: AuthenticatedActor, rawQuery: FolderQuery): Promise<FolderPage> {
      const query = folderQuerySchema.parse(rawQuery);
      const after = decodeRankCursor(query.cursor);
      const rows = await repository.listActive(actor.userId, {
        limit: query.limit + 1,
        ...(after ? { after } : {}),
      });
      const page = pageFromRows(rows, query.limit);
      return folderPageSchema.parse({ items: page.items.map(mapFolder), nextCursor: page.nextCursor });
    },

    async getFolder(actor: AuthenticatedActor, rawFolderId: string): Promise<FolderDto> {
      const folderId = entityIdSchema.parse(rawFolderId);
      const folder = await repository.findById(actor.userId, folderId);
      if (!folder) throw taskResourceNotFound();
      return mapFolder(folder);
    },

    async createFolder(
      actor: AuthenticatedActor,
      rawResourceId: string,
      rawInput: CreateFolderRequest,
    ): Promise<CreateResult<FolderDto>> {
      const input = createFolderRequestSchema.parse(rawInput);
      const resourceId = entityIdSchema.parse(rawResourceId);
      const name = normalizeFolderName(input.name);
      return database.transaction(async (transaction) => {
        const replay = await repository.lockById(actor.userId, resourceId, transaction);
        if (replay) return folderReplay(replay, name);
        const plan = await planLockedRank(
          transaction,
          ["folders", actor.userId],
          () => repository.listActiveRanks(actor.userId, transaction),
          resourceId,
          input.placement,
        );
        const existing = await repository.lockById(actor.userId, resourceId, transaction);
        if (existing) return folderReplay(existing, name);

        const rebalance = siblingRebalance(plan, resourceId);
        if (rebalance.length > 0) {
          await repository.rewriteRanks(actor.userId, rebalance, clock.now(), transaction);
        }
        const now = clock.now();
        const created = await repository.insert(
          { id: resourceId, userId: actor.userId, name, rank: plan.rank, now },
          transaction,
        );
        if (!created) throw idempotencyConflict();
        return { created: true, value: mapFolder(created) };
      });
    },

    async updateFolder(
      actor: AuthenticatedActor,
      rawFolderId: string,
      rawInput: UpdateFolderRequest,
    ): Promise<FolderDto> {
      const input = updateFolderRequestSchema.parse(rawInput);
      const folderId = entityIdSchema.parse(rawFolderId);
      const name = normalizeFolderName(input.patch.name ?? "");
      return database.transaction(async (transaction) => {
        const current = await repository.lockById(actor.userId, folderId, transaction);
        assertMutableFolder(current, input.expectedVersion);
        const updated = await repository.updateName(
          {
            userId: actor.userId,
            id: folderId,
            expectedVersion: input.expectedVersion,
            name,
            now: clock.now(),
          },
          transaction,
        );
        if (!updated) throw staleTaskResource(input.expectedVersion);
        return mapFolder(updated);
      });
    },

    async positionFolder(
      actor: AuthenticatedActor,
      rawFolderId: string,
      rawInput: PositionFolderRequest,
    ): Promise<FolderDto> {
      const input = positionFolderRequestSchema.parse(rawInput);
      const folderId = entityIdSchema.parse(rawFolderId);
      return database.transaction(async (transaction) => {
        const plan = await planLockedRank(
          transaction,
          ["folders", actor.userId],
          () => repository.listActiveRanks(actor.userId, transaction),
          folderId,
          input.placement,
        );
        const current = await repository.lockById(actor.userId, folderId, transaction);
        assertMutableFolder(current, input.expectedVersion);
        const rebalance = siblingRebalance(plan, folderId);
        if (rebalance.length > 0) {
          await repository.rewriteRanks(actor.userId, rebalance, clock.now(), transaction);
        }
        const updated = await repository.updateRank(
          {
            userId: actor.userId,
            id: folderId,
            expectedVersion: input.expectedVersion,
            rank: plan.rank,
            now: clock.now(),
          },
          transaction,
        );
        if (!updated) throw staleTaskResource(current?.version ?? input.expectedVersion);
        return mapFolder(updated);
      });
    },

    async deleteFolder(
      actor: AuthenticatedActor,
      rawFolderId: string,
      rawInput: { expectedVersion: number },
    ): Promise<FolderDto> {
      const input = deleteFolderRequestSchema.parse(rawInput);
      const folderId = entityIdSchema.parse(rawFolderId);
      return database.transaction(async (transaction) => {
        const current = await repository.lockById(actor.userId, folderId, transaction);
        assertMutableFolder(current, input.expectedVersion);
        const deleted = await repository.softDelete(
          { userId: actor.userId, id: folderId, expectedVersion: input.expectedVersion, now: clock.now() },
          transaction,
        );
        if (!deleted) throw staleTaskResource(current?.version ?? input.expectedVersion);
        return mapFolder(deleted);
      });
    },

    async restoreFolder(
      actor: AuthenticatedActor,
      rawFolderId: string,
      rawInput: { expectedVersion: number },
    ): Promise<FolderDto> {
      const input = restoreFolderRequestSchema.parse(rawInput);
      const folderId = entityIdSchema.parse(rawFolderId);
      return database.transaction(async (transaction) => {
        const current = await repository.lockById(actor.userId, folderId, transaction);
        if (!current) throw taskResourceNotFound();
        if (current.deletedAt === null) throw taskConflict("This folder is already active.", current.version);
        if (current.version !== input.expectedVersion) throw staleTaskResource(current.version);
        const restored = await repository.restore(
          { userId: actor.userId, id: folderId, expectedVersion: input.expectedVersion, now: clock.now() },
          transaction,
        );
        if (!restored) throw staleTaskResource(current.version);
        return mapFolder(restored);
      });
    },
  };
}

function assertMutableFolder(
  folder: StoredFolder | null,
  expectedVersion: number,
): asserts folder is StoredFolder {
  if (!folder) throw taskResourceNotFound();
  if (folder.deletedAt !== null) throw taskConflict("This folder is in Trash.", folder.version);
  if (folder.version !== expectedVersion) throw staleTaskResource(folder.version);
}

function mapFolder(folder: StoredFolder): FolderDto {
  return folderDtoSchema.parse({
    id: folder.id,
    name: folder.name,
    rank: folder.rank,
    version: folder.version,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
    deletedAt: folder.deletedAt?.toISOString() ?? null,
  });
}

function idempotencyConflict() {
  return taskConflict("This create key was already used for different folder data.");
}

function folderReplay(folder: StoredFolder, name: string): CreateResult<FolderDto> {
  if (folder.deletedAt !== null || folder.name !== name) throw idempotencyConflict();
  return { created: false, value: mapFolder(folder) };
}
