import {
  configureTaskReminderReconciler,
  getTasksApplication,
  type TaskReminderReconciler,
} from "@/modules/tasks";
import { getProductionNotificationApplication } from "@/modules/notifications";
import { createProductionAssistantPlannerApplication } from "@/modules/assistant";

let applications: ReleaseApplications | undefined;

export function getReleaseApplications(): ReleaseApplications {
  applications ??= createReleaseApplications();
  return applications;
}

function createReleaseApplications() {
  const reminderReconciler = createLateBoundReminderReconciler();
  configureTaskReminderReconciler(reminderReconciler);
  const tasks = getTasksApplication();
  const notifications = getProductionNotificationApplication({
    taskSourceReader: tasks.reminderSources,
  });
  reminderReconciler.bind(notifications.reconciler);
  const assistant = createProductionAssistantPlannerApplication({ tasks });

  return { assistant, tasks, notifications } as const;
}

function createLateBoundReminderReconciler(): LateBoundTaskReminderReconciler {
  let delegate: TaskReminderReconciler | undefined;

  function current(): TaskReminderReconciler {
    if (!delegate) {
      throw new Error("The release reminder reconciler has not been bound.");
    }
    return delegate;
  }

  return {
    bind(value) {
      if (delegate) {
        throw new Error("The release reminder reconciler is already bound.");
      }
      delegate = value;
    },
    prepare(actor, taskIds) {
      return current().prepare(actor, taskIds);
    },
    reconcile(actor, change, executor) {
      return current().reconcile(actor, change, executor);
    },
    applyRecurrenceResolution(actor, input, executor) {
      return current().applyRecurrenceResolution(actor, input, executor);
    },
  };
}

type LateBoundTaskReminderReconciler = TaskReminderReconciler &
  Readonly<{ bind(value: TaskReminderReconciler): void }>;

export type ReleaseApplications = ReturnType<typeof createReleaseApplications>;
