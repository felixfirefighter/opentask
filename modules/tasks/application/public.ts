import { getDatabase } from "@/shared/db/client";
import { systemClock } from "@/shared/time/clock";

import { createTasksApplication } from "./tasks-application";

let application: ReturnType<typeof createTasksApplication> | undefined;

export function getTasksApplication() {
  application ??= createTasksApplication({ database: getDatabase(), clock: systemClock });
  return application;
}
