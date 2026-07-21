import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { createHabitDefinitionApplication } from "./habit-definition-application";
import { createHabitFocusLinkReader } from "./habit-focus-link-reader";
import { createHabitLogApplication } from "./habit-log-application";
import { createHabitProjectionApplication } from "./habit-projection-application";
import { createPostgresHabitReadSnapshot } from "./habit-read-snapshot";
import { createHabitScheduleApplication } from "./habit-schedule-application";
import { createHabitSnapshotReader } from "./habit-snapshot-reader";

export function createHabitsApplication({ database, clock }: { database: Database; clock: Clock }) {
  const snapshot = createPostgresHabitReadSnapshot(database);
  return {
    definitions: createHabitDefinitionApplication({ database, clock, snapshot }),
    schedules: createHabitScheduleApplication({ database, clock }),
    logs: createHabitLogApplication({ database, clock }),
    projections: createHabitProjectionApplication({ database, clock, snapshot }),
    focusLinks: createHabitFocusLinkReader(database),
    snapshots: createHabitSnapshotReader(database),
  } as const;
}

export type HabitsApplication = ReturnType<typeof createHabitsApplication>;
