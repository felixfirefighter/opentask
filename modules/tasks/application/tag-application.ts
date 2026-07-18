import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  createTagRequestSchema,
  deleteTagRequestSchema,
  entityIdSchema,
  replaceTaskTagsRequestSchema,
  replaceTaskTagsOutputSchema,
  restoreTagRequestSchema,
  tagDtoSchema,
  tagPageSchema,
  tagQuerySchema,
  updateTagRequestSchema,
  type CreateTagRequest,
  type ReplaceTaskTagsRequest,
  type ReplaceTaskTagsOutput,
  type TagDto,
  type TagPage,
  type TagQuery,
  type UpdateTagRequest,
} from "./contracts";
import { staleTaskResource, taskConflict, taskResourceNotFound, taskValidationFailure } from "./task-errors";
import { normalizeTagName } from "../domain/task-text";
import { createTagRepository, type StoredTag } from "../infrastructure/tag-repository";

export type TagCreateResult = Readonly<{ created: boolean; value: TagDto }>;
const tagCursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuidv4(),
});

type TagCursor = z.infer<typeof tagCursorPayloadSchema>;

export function createTagApplication({ database, clock }: { database: Database; clock: Clock }) {
  const repository = createTagRepository(database);

  return {
    async listTags(actor: AuthenticatedActor, rawQuery: TagQuery): Promise<TagPage> {
      const query = parseTagQuery(rawQuery);
      const cursor = decodeTagCursor(query.cursor);
      const after = cursor ? await repository.resolveActivePageCursor(actor.userId, cursor.id) : undefined;
      if (cursor && !after) throw taskValidationFailure("The tag page cursor is invalid or expired.");
      const rows = await repository.listActive(actor.userId, {
        limit: query.limit + 1,
        ...(after ? { after } : {}),
      });
      const items = rows.slice(0, query.limit).map(mapActiveTag);
      const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
      return tagPageSchema.parse({
        items,
        nextCursor: last ? encodeTagCursor({ version: 1, id: last.id }) : null,
      });
    },

    async getTag(actor: AuthenticatedActor, rawTagId: string): Promise<TagDto> {
      const tagId = entityIdSchema.parse(rawTagId);
      const tag = await repository.findActiveById(actor.userId, tagId);
      if (!tag) throw taskResourceNotFound();
      return mapActiveTag(tag);
    },

    async createTag(
      actor: AuthenticatedActor,
      rawResourceId: string,
      rawInput: CreateTagRequest,
    ): Promise<TagCreateResult> {
      const resourceId = entityIdSchema.parse(rawResourceId);
      const input = createTagRequestSchema.parse(rawInput);
      const name = normalizeTagName(input.name);

      return database.transaction(async (transaction) => {
        await repository.lockNameMutations(actor.userId, transaction);
        const replay = await repository.lockById(actor.userId, resourceId, transaction);
        if (replay) return tagReplay(replay, name, input.colorToken);
        if (await repository.findActiveEquivalentName(actor.userId, name, undefined, transaction)) {
          throw duplicateTagName();
        }
        const created = await repository.insert(
          { id: resourceId, userId: actor.userId, name, colorToken: input.colorToken, now: clock.now() },
          transaction,
        );
        if (!created) throw tagIdempotencyConflict();
        return { created: true, value: mapActiveTag(created) };
      });
    },

    async updateTag(
      actor: AuthenticatedActor,
      rawTagId: string,
      rawInput: UpdateTagRequest,
    ): Promise<TagDto> {
      const tagId = entityIdSchema.parse(rawTagId);
      const input = updateTagRequestSchema.parse(rawInput);
      const name = input.patch.name === undefined ? undefined : normalizeTagName(input.patch.name);

      return database.transaction(async (transaction) => {
        if (name !== undefined) await repository.lockNameMutations(actor.userId, transaction);
        const current = await repository.lockById(actor.userId, tagId, transaction);
        assertMutableTag(current, input.expectedVersion);
        if (
          name !== undefined &&
          (await repository.findActiveEquivalentName(actor.userId, name, tagId, transaction))
        ) {
          throw duplicateTagName();
        }
        const updated = await repository.update(
          {
            userId: actor.userId,
            id: tagId,
            expectedVersion: input.expectedVersion,
            patch: {
              ...(name === undefined ? {} : { name }),
              ...(input.patch.colorToken === undefined ? {} : { colorToken: input.patch.colorToken }),
            },
            now: clock.now(),
          },
          transaction,
        );
        if (!updated) throw staleTaskResource(current.version);
        return mapActiveTag(updated);
      });
    },

    async deleteTag(
      actor: AuthenticatedActor,
      rawTagId: string,
      rawInput: { expectedVersion: number },
    ): Promise<TagDto> {
      const tagId = entityIdSchema.parse(rawTagId);
      const input = deleteTagRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await repository.lockById(actor.userId, tagId, transaction);
        assertMutableTag(current, input.expectedVersion);
        const deleted = await repository.softDelete(
          { userId: actor.userId, id: tagId, expectedVersion: input.expectedVersion, now: clock.now() },
          transaction,
        );
        if (!deleted) throw staleTaskResource(current.version);
        return mapTag(deleted);
      });
    },

    async restoreTag(
      actor: AuthenticatedActor,
      rawTagId: string,
      rawInput: { expectedVersion: number },
    ): Promise<TagDto> {
      const tagId = entityIdSchema.parse(rawTagId);
      const input = restoreTagRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        await repository.lockNameMutations(actor.userId, transaction);
        const current = await repository.lockById(actor.userId, tagId, transaction);
        if (!current) throw taskResourceNotFound();
        if (current.deletedAt === null) throw taskConflict("This tag is already active.");
        if (current.version !== input.expectedVersion) throw staleTaskResource(current.version);
        if (await repository.findActiveEquivalentName(actor.userId, current.name, current.id, transaction)) {
          throw duplicateTagName();
        }
        const restored = await repository.restore(
          { userId: actor.userId, id: tagId, expectedVersion: input.expectedVersion, now: clock.now() },
          transaction,
        );
        if (!restored) throw staleTaskResource(current.version);
        return mapActiveTag(restored);
      });
    },

    async replaceTaskTags(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: ReplaceTaskTagsRequest,
    ): Promise<ReplaceTaskTagsOutput> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = replaceTaskTagsRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const result = await repository.replaceForActiveTask(
          {
            userId: actor.userId,
            taskId,
            expectedTaskVersion: input.expectedVersion,
            tagIds: input.tagIds,
            now: clock.now(),
          },
          transaction,
        );
        if (result.kind === "task_not_found") throw taskResourceNotFound();
        if (result.kind === "task_stale") throw staleTaskResource(result.currentVersion);
        if (result.kind === "tag_conflict") {
          throw taskConflict("One or more selected tags is unavailable.");
        }
        return replaceTaskTagsOutputSchema.parse({
          task: { id: result.taskId, version: result.version },
          tags: result.tags.map(mapActiveTag),
        });
      });
    },
  };
}

function assertMutableTag(tag: StoredTag | null, expectedVersion: number): asserts tag is StoredTag {
  if (!tag) throw taskResourceNotFound();
  if (tag.deletedAt !== null) throw taskConflict("This tag is in Trash.");
  if (tag.version !== expectedVersion) throw staleTaskResource(tag.version);
}

function mapTag(tag: StoredTag): TagDto {
  return tagDtoSchema.parse({
    id: tag.id,
    name: tag.name,
    colorToken: tag.colorToken,
    version: tag.version,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
    deletedAt: tag.deletedAt?.toISOString() ?? null,
  });
}

function mapActiveTag(tag: StoredTag): TagDto {
  if (tag.deletedAt !== null) throw new Error("Active tag query returned a deleted tag.");
  return mapTag(tag);
}

function tagReplay(tag: StoredTag, name: string, colorToken: string): TagCreateResult {
  if (tag.deletedAt !== null || tag.name !== name || tag.colorToken !== colorToken) {
    throw tagIdempotencyConflict();
  }
  return { created: false, value: mapActiveTag(tag) };
}

function duplicateTagName() {
  return taskConflict("An active tag already uses an equivalent name.");
}

function tagIdempotencyConflict() {
  return taskConflict("This create key was already used for different tag data.");
}

function parseTagQuery(rawQuery: TagQuery) {
  try {
    return tagQuerySchema.parse(rawQuery);
  } catch {
    throw taskValidationFailure("Review the tag query and page cursor.");
  }
}

function encodeTagCursor(cursor: TagCursor): string {
  return Buffer.from(JSON.stringify(tagCursorPayloadSchema.parse(cursor)), "utf8").toString("base64url");
}

function decodeTagCursor(cursor: string | undefined): TagCursor | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed = tagCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown,
    );
    if (encodeTagCursor(parsed) !== cursor) throw new Error("Non-canonical cursor");
    return parsed;
  } catch {
    throw taskValidationFailure("The tag page cursor is invalid or expired.");
  }
}
