import { getDatabase } from "@/shared/db/client";
import { taskSchedules } from "@/shared/db/schema";
import { systemClock } from "@/shared/time/clock";

import { createTasksApplication } from "./tasks-application";

let application: ReturnType<typeof createTasksApplication> | undefined;

export function getTasksApplication() {
  application ??= createTasksApplication({
    database: getDatabase(),
    clock: systemClock,
    taskSchedules,
    resolveUserTimezone: async (actor) => {
      const { getUserPreferences } = await import("@/modules/identity");
      return (await getUserPreferences(actor)).timezone;
    },
  });
  return application;
}
