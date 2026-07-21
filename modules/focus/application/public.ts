import { getHabitsApplication } from "@/modules/habits";
import { getTasksApplication } from "@/modules/tasks";
import { getDatabase } from "@/shared/db/client";
import { systemClock } from "@/shared/time/clock";

import { createFocusApplication } from "./focus-application";
import { createHabitFocusLinkValidator, createTaskFocusLinkValidator } from "./focus-link-adapters";

let application: ReturnType<typeof createFocusApplication> | undefined;

export function getFocusApplication() {
  if (!application) {
    const tasks = getTasksApplication();
    const habits = getHabitsApplication();
    application = createFocusApplication({
      database: getDatabase(),
      clock: systemClock,
      links: {
        task: createTaskFocusLinkValidator(tasks.focusLinks),
        habit: createHabitFocusLinkValidator(habits.focusLinks),
      },
      resolveUserTimezone: async (actor) => {
        const { getUserPreferences } = await import("@/modules/identity");
        return (await getUserPreferences(actor)).timezone;
      },
    });
  }
  return application;
}
