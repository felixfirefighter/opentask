import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";

import {
  tagDtoSchema,
  taskDtoSchema,
  taskSearchPageSchema,
  taskSearchQuerySchema,
  taskSearchResultDtoSchema,
  type TagDto,
  type TaskDto,
  type TaskSearchPage,
  type TaskSearchQuery,
  type TaskSearchResultDto,
} from "./contracts";
import { mapTaskRecurrenceSummary } from "./task-list-item-projection";
import { taskValidationFailure } from "./task-errors";
import type { StoredTag } from "../infrastructure/tag-repository";
import {
  createTaskRecurrenceRepository,
  type StoredTaskRecurrence,
} from "../infrastructure/task-recurrence-repository";
import {
  createTaskSearchRepository,
  type StoredSearchTask,
  type StoredTaskSearchResult,
} from "../infrastructure/task-search-repository";

const searchCursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  updatedAt: z.iso.datetime({ offset: true }),
  id: z.uuidv4(),
});

type SearchCursor = z.infer<typeof searchCursorPayloadSchema>;

export function createSearchApplication({ database }: { database: Database }) {
  const repository = createTaskSearchRepository(database);
  const recurrences = createTaskRecurrenceRepository(database);

  return {
    async searchTasks(actor: AuthenticatedActor, rawQuery: TaskSearchQuery): Promise<TaskSearchPage> {
      const query = parseSearchQuery(rawQuery);
      const after = decodeSearchCursor(query.cursor);
      const page = await repository.search(actor.userId, {
        q: query.q,
        limit: query.limit,
        ...(after ? { after: { updatedAt: new Date(after.updatedAt), id: after.id } } : {}),
      });
      const recurrenceByTask = new Map(
        (
          await recurrences.listForTaskIds(
            actor.userId,
            page.items.map(({ task }) => task.id),
          )
        ).map((recurrence) => [recurrence.taskId, recurrence]),
      );
      return taskSearchPageSchema.parse({
        items: page.items.map((result) => mapSearchResult(result, recurrenceByTask.get(result.task.id))),
        nextCursor: page.next
          ? encodeSearchCursor({
              version: 1,
              updatedAt: page.next.updatedAt.toISOString(),
              id: page.next.id,
            })
          : null,
      });
    },
  };
}

function mapSearchResult(
  result: StoredTaskSearchResult,
  recurrence: StoredTaskRecurrence | undefined,
): TaskSearchResultDto {
  if (result.task.deletedAt !== null || result.matchingTags.some((tag) => tag.deletedAt !== null)) {
    throw new Error("Search repository returned deleted data.");
  }
  return taskSearchResultDtoSchema.parse({
    task: mapTask(result.task),
    list: result.list,
    recurrence: mapTaskRecurrenceSummary(recurrence),
    matchedFields: result.matchedFields,
    matchingTags: result.matchingTags.map(mapTag),
  });
}

function mapTask(task: StoredSearchTask): TaskDto {
  return taskDtoSchema.parse({
    id: task.id,
    listId: task.listId,
    sectionId: task.sectionId,
    parentTaskId: task.parentTaskId,
    title: task.title,
    descriptionMd: task.descriptionMd,
    status: task.status,
    priority: task.priority,
    rank: task.rank,
    statusChangedAt: task.statusChangedAt.toISOString(),
    version: task.version,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    deletedAt: null,
  });
}

function mapTag(tag: StoredTag): TagDto {
  return tagDtoSchema.parse({
    id: tag.id,
    name: tag.name,
    colorToken: tag.colorToken,
    version: tag.version,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
    deletedAt: null,
  });
}

function parseSearchQuery(rawQuery: TaskSearchQuery) {
  try {
    return taskSearchQuerySchema.parse(rawQuery);
  } catch {
    throw taskValidationFailure("Review the search query and page cursor.");
  }
}

function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(searchCursorPayloadSchema.parse(cursor)), "utf8").toString("base64url");
}

function decodeSearchCursor(cursor: string | undefined): SearchCursor | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed = searchCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown,
    );
    if (encodeSearchCursor(parsed) !== cursor) throw new Error("Non-canonical cursor");
    return parsed;
  } catch {
    throw taskValidationFailure("The search page cursor is invalid or expired.");
  }
}
