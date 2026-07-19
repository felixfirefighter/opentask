import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";

import { taskPageSchema, terminalTaskQuerySchema, type TaskPage, type TerminalTaskQuery } from "./contracts";
import { decodeTerminalTaskCursor, encodeTerminalTaskCursor } from "./terminal-task-cursor";
import { mapTaskListItems } from "./task-list-item-projection";
import { createTagRepository } from "../infrastructure/tag-repository";
import { createTaskRepository } from "../infrastructure/task-repository";

export function createTerminalTaskQuery({ database }: { database: Database }) {
  const tasks = createTaskRepository(database);
  const tags = createTagRepository(database);

  return {
    async listTerminalTasks(actor: AuthenticatedActor, rawQuery: TerminalTaskQuery): Promise<TaskPage> {
      const query = terminalTaskQuerySchema.parse(rawQuery);
      const cursor = decodeTerminalTaskCursor(query.cursor, query.status);
      const rows = await tasks.listActiveTerminalPage(actor.userId, {
        status: query.status,
        limit: query.limit + 1,
        ...(cursor ? { after: { id: cursor.id, statusChangedAt: new Date(cursor.statusChangedAt) } } : {}),
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      const taskTags = await tags.listActiveForTasks(
        actor.userId,
        items.map(({ id }) => id),
      );
      return taskPageSchema.parse({
        items: mapTaskListItems(items, taskTags),
        nextCursor:
          rows.length > query.limit && last
            ? encodeTerminalTaskCursor({
                version: 1,
                status: query.status,
                id: last.id,
                statusChangedAt: last.statusChangedAt.toISOString(),
              })
            : null,
      });
    },
  } as const;
}
