import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { createOccurrenceCommand, type OccurrenceEventIdFactory } from "./occurrence-command";
import { createBoundedOccurrenceReader } from "./occurrence-reader";
import type { UserTimezoneResolver } from "./recurrence-application-support";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTaskOccurrenceApplication(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    taskSchedules: TaskScheduleTable;
    expansion: RecurrenceExpansionPort;
    resolveUserTimezone: UserTimezoneResolver;
    createEventId: OccurrenceEventIdFactory;
  }>,
) {
  const readBoundedOccurrences = createBoundedOccurrenceReader(dependencies);
  const transitionOccurrence = createOccurrenceCommand(dependencies);
  return {
    readBoundedOccurrences,
    transitionOccurrence,
    applyOccurrenceCommand: transitionOccurrence,
  } as const;
}
