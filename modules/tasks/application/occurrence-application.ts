import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { createOccurrenceCommand, type OccurrenceEventIdFactory } from "./occurrence-command";
import { createOccurrenceDetailReader } from "./occurrence-detail-reader";
import { createBoundedOccurrenceReader, createBoundedOccurrenceSnapshotReader } from "./occurrence-reader";
import type { UserTimezoneResolver } from "./recurrence-application-support";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { createPostgresTaskReadSnapshot, type TaskReadSnapshot } from "./task-read-snapshot";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTaskOccurrenceApplication(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    taskSchedules: TaskScheduleTable;
    expansion: RecurrenceExpansionPort;
    resolveUserTimezone: UserTimezoneResolver;
    createEventId: OccurrenceEventIdFactory;
    snapshot?: TaskReadSnapshot;
  }>,
) {
  const snapshot = dependencies.snapshot ?? createPostgresTaskReadSnapshot(dependencies.database);
  const readBoundedOccurrencesInSnapshot = createBoundedOccurrenceSnapshotReader(dependencies);
  const readBoundedOccurrences = createBoundedOccurrenceReader({
    snapshot,
    readInSnapshot: readBoundedOccurrencesInSnapshot,
    resolveUserTimezone: dependencies.resolveUserTimezone,
  });
  const readOccurrence = createOccurrenceDetailReader({
    snapshot,
    taskSchedules: dependencies.taskSchedules,
  });
  const transitionOccurrence = createOccurrenceCommand(dependencies);
  return {
    readBoundedOccurrences,
    readBoundedOccurrencesInSnapshot,
    readOccurrence,
    transitionOccurrence,
    applyOccurrenceCommand: transitionOccurrence,
  } as const;
}
