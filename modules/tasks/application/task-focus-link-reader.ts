import type { Database } from "@/shared/db/client";

import {
  entityIdSchema,
  taskFocusLinkDtoSchema,
  taskFocusLinkIdSelectionSchema,
  taskFocusLinkSearchInputSchema,
  type TaskFocusLinkDto,
  type TaskFocusLinkReader,
} from "./contracts";
import {
  createTaskFocusLinkRepository,
  type StoredTaskFocusLink,
} from "../infrastructure/task-focus-link-repository";

export function createTaskFocusLinkReader(database: Database): TaskFocusLinkReader {
  const repository = createTaskFocusLinkRepository(database);
  return {
    async readOwned(actor, rawTaskId, executor = database) {
      const taskId = entityIdSchema.parse(rawTaskId);
      const row = await repository.readOwned(actor.userId, taskId, executor);
      return row ? mapTaskFocusLink(row) : null;
    },

    async readOwnedMany(actor, rawTaskIds, executor = database) {
      const taskIds = taskFocusLinkIdSelectionSchema.parse(rawTaskIds);
      const rows = await repository.readOwnedMany(actor.userId, taskIds, executor);
      const byId = new Map(rows.map((row) => [row.id, row]));
      return taskIds.flatMap((id) => {
        const row = byId.get(id);
        return row ? [mapTaskFocusLink(row)] : [];
      });
    },

    async searchOwned(actor, rawInput) {
      const input = taskFocusLinkSearchInputSchema.parse(rawInput);
      const rows = await repository.searchOwned(actor.userId, input);
      return rows.map(mapTaskFocusLink);
    },
  };
}

function mapTaskFocusLink(row: StoredTaskFocusLink): TaskFocusLinkDto {
  return taskFocusLinkDtoSchema.parse({
    id: row.id,
    title: row.title,
    status: row.status,
    available: row.deletedAt === null,
  });
}
