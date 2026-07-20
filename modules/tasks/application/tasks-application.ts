import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import { createChecklistApplication } from "./checklist-application";
import { createFolderApplication } from "./folder-application";
import { createListApplication } from "./list-application";
import { createSearchApplication } from "./search-application";
import { createQuickAddApplication } from "./quick-add-application";
import { createTaskScheduleApplication } from "./schedule-application";
import { createSectionApplication } from "./section-application";
import { createTagApplication } from "./tag-application";
import { createTaskApplication } from "./task-application";
import { createTaskSnapshotReader } from "./task-snapshot-reader";
import { createTaskPlanningSourceReader } from "./task-planning-source-reader";
import { createReviewedPlanTaskWriter } from "./reviewed-plan-task-writer";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTasksApplication({
  database,
  clock,
  taskSchedules,
}: {
  database: Database;
  clock: Clock;
  taskSchedules: TaskScheduleTable;
}) {
  return {
    folders: createFolderApplication({ database, clock }),
    lists: createListApplication({ database, clock }),
    sections: createSectionApplication({ database, clock }),
    tasks: createTaskApplication({ database, clock, taskSchedules }),
    checklist: createChecklistApplication({ database, clock }),
    tags: createTagApplication({ database, clock }),
    search: createSearchApplication({ database }),
    quickAdd: createQuickAddApplication({ clock }),
    schedules: createTaskScheduleApplication({ database, clock, taskSchedules }),
    planningSource: createTaskPlanningSourceReader({ database, taskSchedules }),
    reviewedPlanWrites: createReviewedPlanTaskWriter({ clock, taskSchedules }),
    taskSnapshots: createTaskSnapshotReader({ database, taskSchedules }),
  } as const;
}

export type TasksApplication = ReturnType<typeof createTasksApplication>;
