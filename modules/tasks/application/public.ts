import { getDatabase } from "@/shared/db/client";
import { awardCompanionXp } from "@/modules/companion";
import { taskSchedules } from "@/shared/db/schema";
import { systemClock } from "@/shared/time/clock";

import { createTasksApplication } from "./tasks-application";

let application: ReturnType<typeof createTasksApplication> | undefined;

export function getTasksApplication() {
  application ??= createTasksApplication({
    database: getDatabase(),
    clock: systemClock,
    taskSchedules,
    onTaskCompleted: async (actor, task, transaction) => {
      await awardCompanionXp(
        actor,
        { actionType: "task_completed", sourceKey: `task:${task.id}`, xp: 10 },
        transaction,
      );
    },
  });
  return application;
}
