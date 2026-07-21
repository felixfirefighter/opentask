import { getDatabase } from "@/shared/db/client";
import { taskSchedules } from "@/shared/db/schema";
import { systemClock } from "@/shared/time/clock";

import { createTasksApplication } from "./tasks-application";
import { noopTaskReminderReconciler, type TaskReminderReconciler } from "./contracts";

let application: ReturnType<typeof createTasksApplication> | undefined;
let configuredReminderReconciler: TaskReminderReconciler = noopTaskReminderReconciler;
let reminderReconcilerConfigured = false;

const configurableReminderReconciler: TaskReminderReconciler = {
  prepare: (actor, taskIds) => configuredReminderReconciler.prepare(actor, taskIds),
  reconcile: (actor, change, executor) => configuredReminderReconciler.reconcile(actor, change, executor),
  applyRecurrenceResolution: (actor, input, executor) =>
    configuredReminderReconciler.applyRecurrenceResolution(actor, input, executor),
};

export function getTasksApplication() {
  application ??= createProductionTasksApplication({
    reminderReconciler: configurableReminderReconciler,
  });
  return application;
}

export function configureTaskReminderReconciler(reminderReconciler: TaskReminderReconciler): void {
  if (reminderReconcilerConfigured) {
    throw new Error("The tasks reminder reconciler has already been configured.");
  }
  configuredReminderReconciler = reminderReconciler;
  reminderReconcilerConfigured = true;
}

function createProductionTasksApplication({
  reminderReconciler,
}: Readonly<{ reminderReconciler: TaskReminderReconciler }>) {
  return createTasksApplication({
    database: getDatabase(),
    clock: systemClock,
    taskSchedules,
    reminderReconciler,
    resolveUserTimezone: async (actor) => {
      const { getUserPreferences } = await import("@/modules/identity");
      return (await getUserPreferences(actor)).timezone;
    },
  });
}
