import { getDatabase } from "@/shared/db/client";
import { systemClock } from "@/shared/time/clock";

import { createHabitsApplication } from "./habits-application";

let application: ReturnType<typeof createHabitsApplication> | undefined;

export function getHabitsApplication() {
  application ??= createHabitsApplication({ database: getDatabase(), clock: systemClock });
  return application;
}
