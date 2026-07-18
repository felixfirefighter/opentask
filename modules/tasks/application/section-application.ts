import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  createSectionRequestSchema,
  deleteSectionRequestSchema,
  entityIdSchema,
  positionSectionRequestSchema,
  sectionDtoSchema,
  sectionPageSchema,
  sectionQuerySchema,
  updateSectionRequestSchema,
  type CreateSectionRequest,
  type PositionSectionRequest,
  type SectionDto,
  type SectionPage,
  type SectionQuery,
  type UpdateSectionRequest,
} from "./contracts";
import type { CreateResult } from "./folder-application";
import { decodeRankCursor, pageFromRows } from "./page-cursor";
import { planLockedRank, siblingRebalance } from "./rank-operation";
import { staleTaskResource, taskConflict, taskResourceNotFound } from "./task-errors";
import { normalizeSectionName } from "../domain/task-text";
import { createSectionRepository, type StoredSection } from "../infrastructure/section-repository";
import { createTaskListRepository } from "../infrastructure/task-list-repository";

export function createSectionApplication({ database, clock }: { database: Database; clock: Clock }) {
  const repository = createSectionRepository(database);
  const listRepository = createTaskListRepository(database);

  return {
    async listSections(
      actor: AuthenticatedActor,
      rawListId: string,
      rawQuery: SectionQuery,
    ): Promise<SectionPage> {
      const listId = entityIdSchema.parse(rawListId);
      const query = sectionQuerySchema.parse(rawQuery);
      await assertActiveList(actor.userId, listId, database);
      const after = decodeRankCursor(query.cursor);
      const rows = await repository.list(actor.userId, listId, {
        limit: query.limit + 1,
        ...(after ? { after } : {}),
      });
      const page = pageFromRows(rows, query.limit);
      return sectionPageSchema.parse({
        items: page.items.map(mapSection),
        nextCursor: page.nextCursor,
      });
    },

    async getSection(actor: AuthenticatedActor, rawListId: string, rawSectionId: string) {
      const listId = entityIdSchema.parse(rawListId);
      const sectionId = entityIdSchema.parse(rawSectionId);
      await assertActiveList(actor.userId, listId, database);
      const section = await repository.findById(actor.userId, listId, sectionId);
      if (!section) throw taskResourceNotFound();
      return mapSection(section);
    },

    async createSection(
      actor: AuthenticatedActor,
      rawListId: string,
      rawResourceId: string,
      rawInput: CreateSectionRequest,
    ): Promise<CreateResult<SectionDto>> {
      const listId = entityIdSchema.parse(rawListId);
      const resourceId = entityIdSchema.parse(rawResourceId);
      const input = createSectionRequestSchema.parse(rawInput);
      const name = normalizeSectionName(input.name);

      return database.transaction(async (transaction) => {
        const replay = await repository.lockById(actor.userId, listId, resourceId, transaction);
        if (replay) return sectionReplay(replay, name);
        await lockActiveList(actor.userId, listId, transaction);

        const plan = await planLockedRank(
          transaction,
          ["sections", actor.userId, listId],
          () => repository.listRanks(actor.userId, listId, transaction),
          resourceId,
          input.placement,
        );
        const existing = await repository.lockById(actor.userId, listId, resourceId, transaction);
        if (existing) return sectionReplay(existing, name);

        const now = clock.now();
        const rebalance = siblingRebalance(plan, resourceId);
        if (rebalance.length > 0) {
          await repository.rewriteRanks(actor.userId, listId, rebalance, now, transaction);
        }
        const created = await repository.insert(
          { id: resourceId, userId: actor.userId, listId, name, rank: plan.rank, now },
          transaction,
        );
        if (!created) throw sectionIdempotencyConflict();
        return { created: true, value: mapSection(created) };
      });
    },

    async updateSection(
      actor: AuthenticatedActor,
      rawListId: string,
      rawSectionId: string,
      rawInput: UpdateSectionRequest,
    ): Promise<SectionDto> {
      const listId = entityIdSchema.parse(rawListId);
      const sectionId = entityIdSchema.parse(rawSectionId);
      const input = updateSectionRequestSchema.parse(rawInput);
      const name = normalizeSectionName(input.patch.name ?? "");

      return database.transaction(async (transaction) => {
        await lockActiveList(actor.userId, listId, transaction);
        const current = await repository.lockById(actor.userId, listId, sectionId, transaction);
        assertCurrentSection(current, input.expectedVersion);
        const updated = await repository.updateName(
          {
            userId: actor.userId,
            listId,
            id: sectionId,
            expectedVersion: input.expectedVersion,
            name,
            now: clock.now(),
          },
          transaction,
        );
        if (!updated) throw staleTaskResource(current.version);
        return mapSection(updated);
      });
    },

    async positionSection(
      actor: AuthenticatedActor,
      rawListId: string,
      rawSectionId: string,
      rawInput: PositionSectionRequest,
    ): Promise<SectionDto> {
      const listId = entityIdSchema.parse(rawListId);
      const sectionId = entityIdSchema.parse(rawSectionId);
      const input = positionSectionRequestSchema.parse(rawInput);

      return database.transaction(async (transaction) => {
        await lockActiveList(actor.userId, listId, transaction);
        const plan = await planLockedRank(
          transaction,
          ["sections", actor.userId, listId],
          () => repository.listRanks(actor.userId, listId, transaction),
          sectionId,
          input.placement,
        );
        const current = await repository.lockById(actor.userId, listId, sectionId, transaction);
        assertCurrentSection(current, input.expectedVersion);
        const now = clock.now();
        const rebalance = siblingRebalance(plan, sectionId);
        if (rebalance.length > 0) {
          await repository.rewriteRanks(actor.userId, listId, rebalance, now, transaction);
        }
        const updated = await repository.updateRank(
          {
            userId: actor.userId,
            listId,
            id: sectionId,
            expectedVersion: input.expectedVersion,
            rank: plan.rank,
            now,
          },
          transaction,
        );
        if (!updated) throw staleTaskResource(current.version);
        return mapSection(updated);
      });
    },

    async deleteSection(
      actor: AuthenticatedActor,
      rawListId: string,
      rawSectionId: string,
      rawInput: { expectedVersion: number },
    ): Promise<SectionDto> {
      const listId = entityIdSchema.parse(rawListId);
      const sectionId = entityIdSchema.parse(rawSectionId);
      const input = deleteSectionRequestSchema.parse(rawInput);

      return database.transaction(async (transaction) => {
        await lockActiveList(actor.userId, listId, transaction);
        const current = await repository.lockById(actor.userId, listId, sectionId, transaction);
        assertCurrentSection(current, input.expectedVersion);
        if (await repository.hasActiveTasks(actor.userId, listId, sectionId, transaction)) {
          throw sectionNotEmpty(current.version);
        }

        const now = clock.now();
        await repository.clearDeletedTaskReferences(actor.userId, listId, sectionId, now, transaction);
        const deleted = await repository.deleteEmpty(
          { userId: actor.userId, listId, id: sectionId, expectedVersion: input.expectedVersion },
          transaction,
        );
        if (!deleted) throw sectionNotEmpty(current.version);
        return mapSection(deleted);
      });
    },
  };

  async function assertActiveList(userId: string, listId: string, executor: DatabaseExecutor) {
    if (!(await listRepository.findActiveById(userId, listId, executor))) throw taskResourceNotFound();
  }

  async function lockActiveList(userId: string, listId: string, executor: DatabaseExecutor) {
    const list = await listRepository.lockById(userId, listId, executor);
    if (!list || list.deletedAt !== null) throw taskResourceNotFound();
  }
}

function assertCurrentSection(
  section: StoredSection | null,
  expectedVersion: number,
): asserts section is StoredSection {
  if (!section) throw taskResourceNotFound();
  if (section.version !== expectedVersion) throw staleTaskResource(section.version);
}

function mapSection(section: StoredSection): SectionDto {
  return sectionDtoSchema.parse({
    id: section.id,
    listId: section.listId,
    name: section.name,
    rank: section.rank,
    version: section.version,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  });
}

function sectionReplay(section: StoredSection, name: string): CreateResult<SectionDto> {
  if (section.name !== name) throw sectionIdempotencyConflict();
  return { created: false, value: mapSection(section) };
}

function sectionIdempotencyConflict() {
  return taskConflict("This create key was already used for different section data.");
}

function sectionNotEmpty(currentVersion: number) {
  return taskConflict("Move active tasks before deleting this section.", currentVersion);
}
