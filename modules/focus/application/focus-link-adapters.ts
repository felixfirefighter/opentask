import type { HabitFocusLinkReader } from "@/modules/habits";
import type { TaskFocusLinkReader } from "@/modules/tasks";

import type { FocusLinkValidator, FocusOwnedLink } from "./contracts";

export function createTaskFocusLinkValidator(reader: TaskFocusLinkReader): FocusLinkValidator {
  return {
    kind: "task",
    async readOwned(actor, id, executor) {
      const value = await reader.readOwned(actor, id, executor);
      return value ? mapOwnedLink("task", value) : null;
    },
    async readOwnedMany(actor, ids, executor) {
      return (await reader.readOwnedMany(actor, ids, executor)).map((value) => mapOwnedLink("task", value));
    },
    async searchOwned(actor, input) {
      return (await reader.searchOwned(actor, input)).map((value) => mapOwnedLink("task", value));
    },
  };
}

export function createHabitFocusLinkValidator(reader: HabitFocusLinkReader): FocusLinkValidator {
  return {
    kind: "habit",
    async readOwned(actor, id, executor) {
      const value = await reader.readOwned(actor, id, executor);
      return value ? mapOwnedLink("habit", value) : null;
    },
    async readOwnedMany(actor, ids, executor) {
      return (await reader.readOwnedMany(actor, ids, executor)).map((value) => mapOwnedLink("habit", value));
    },
    async searchOwned(actor, input) {
      return (await reader.searchOwned(actor, input)).map((value) => mapOwnedLink("habit", value));
    },
  };
}

function mapOwnedLink(
  kind: "task" | "habit",
  value: Readonly<{ id: string; title: string; available: boolean }>,
): FocusOwnedLink {
  return {
    kind,
    id: value.id,
    label: value.available ? value.title : null,
    available: value.available,
  };
}
