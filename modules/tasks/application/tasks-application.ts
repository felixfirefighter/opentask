import { randomUUID } from "node:crypto";

import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { createChecklistApplication } from "./checklist-application";
import { createFolderApplication } from "./folder-application";
import { createListApplication } from "./list-application";
import { createSearchApplication } from "./search-application";
import { createQuickAddApplication } from "./quick-add-application";
import { createTaskOccurrenceApplication } from "./occurrence-application";
import { createTaskRecurrenceApplication } from "./recurrence-application";
import type { UserTimezoneResolver } from "./recurrence-application-support";
import { createTaskScheduleApplication } from "./schedule-application";
import { createSectionApplication } from "./section-application";
import { createTagApplication } from "./tag-application";
import { createTaskApplication } from "./task-application";
import { createTaskSnapshotReader } from "./task-snapshot-reader";
import {
  createTaskPlanningSourceReader,
  createTaskPlanningSourceSnapshotReader,
} from "./task-planning-source-reader";
import { createTaskPlanningSnapshotReader } from "./task-planning-snapshot-reader";
import { createPostgresTaskReadSnapshot } from "./task-read-snapshot";
import { createReviewedPlanTaskWriter } from "./reviewed-plan-task-writer";
import { RruleRecurrenceExpander } from "../infrastructure/recurrence/rrule-expander";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTasksApplication({
  database,
  clock,
  taskSchedules,
  resolveUserTimezone = async () => "UTC",
}: {
  database: Database;
  clock: Clock;
  taskSchedules: TaskScheduleTable;
  resolveUserTimezone?: UserTimezoneResolver;
}) {
  const expansion = new RruleRecurrenceExpander();
  const readSnapshot = createPostgresTaskReadSnapshot(database);
  const occurrenceApplication = createTaskOccurrenceApplication({
    database,
    clock,
    taskSchedules,
    expansion,
    resolveUserTimezone,
    createEventId: randomUUID,
    snapshot: readSnapshot,
  });
  const { readBoundedOccurrencesInSnapshot, ...occurrences } = occurrenceApplication;
  const readOpenTasksInSnapshot = createTaskPlanningSourceSnapshotReader({ taskSchedules });
  const planningSource = createTaskPlanningSourceReader({
    snapshot: readSnapshot,
    readInSnapshot: readOpenTasksInSnapshot,
  });
  const planningSnapshot = createTaskPlanningSnapshotReader({
    snapshot: readSnapshot,
    readOpenTasksInSnapshot,
    readOccurrencesInSnapshot: readBoundedOccurrencesInSnapshot,
  });
  return {
    folders: createFolderApplication({ database, clock }),
    lists: createListApplication({ database, clock }),
    sections: createSectionApplication({ database, clock }),
    tasks: createTaskApplication({ database, clock, taskSchedules, recurrenceExpansion: expansion }),
    checklist: createChecklistApplication({ database, clock }),
    tags: createTagApplication({ database, clock }),
    search: createSearchApplication({ database }),
    quickAdd: createQuickAddApplication({ clock }),
    schedules: createTaskScheduleApplication({ database, clock, taskSchedules }),
    recurrences: createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules,
      expansion,
      resolveUserTimezone,
      snapshot: readSnapshot,
    }),
    occurrences,
    planningSource,
    planningSnapshot,
    reviewedPlanWrites: createReviewedPlanTaskWriter({
      clock,
      taskSchedules,
      recurrenceExpansion: expansion,
    }),
    taskSnapshots: createTaskSnapshotReader({ database, taskSchedules }),
  } as const;
}

export type TasksApplication = ReturnType<typeof createTasksApplication>;
