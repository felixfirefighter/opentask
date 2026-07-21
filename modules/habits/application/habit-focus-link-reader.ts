import type { Database } from "@/shared/db/client";

import {
  habitFocusLinkDtoSchema,
  habitFocusLinkIdSelectionSchema,
  habitFocusLinkSearchInputSchema,
  habitIdSchema,
  type HabitFocusLinkDto,
  type HabitFocusLinkReader,
} from "./contracts";
import {
  createHabitFocusLinkRepository,
  type StoredHabitFocusLink,
} from "../infrastructure/habit-focus-link-repository";

export function createHabitFocusLinkReader(database: Database): HabitFocusLinkReader {
  const repository = createHabitFocusLinkRepository(database);
  return {
    async readOwned(actor, rawHabitId, executor = database) {
      const habitId = habitIdSchema.parse(rawHabitId);
      const row = await repository.readOwned(actor.userId, habitId, executor);
      return row ? mapHabitFocusLink(row) : null;
    },

    async readOwnedMany(actor, rawHabitIds, executor = database) {
      const habitIds = habitFocusLinkIdSelectionSchema.parse(rawHabitIds);
      const rows = await repository.readOwnedMany(actor.userId, habitIds, executor);
      const byId = new Map(rows.map((row) => [row.id, row]));
      return habitIds.flatMap((id) => {
        const row = byId.get(id);
        return row ? [mapHabitFocusLink(row)] : [];
      });
    },

    async searchOwned(actor, rawInput) {
      const input = habitFocusLinkSearchInputSchema.parse(rawInput);
      const rows = await repository.searchOwned(actor.userId, input);
      return rows.map(mapHabitFocusLink);
    },
  };
}

function mapHabitFocusLink(row: StoredHabitFocusLink): HabitFocusLinkDto {
  return habitFocusLinkDtoSchema.parse({
    id: row.id,
    title: row.title,
    available: row.archivedAt === null,
  });
}
