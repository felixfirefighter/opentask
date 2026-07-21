import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { mapTaskReminder } from "./notification-mapper";
import type { TaskReminderRecord } from "./notification-records";
import { NOTIFICATION_RECOVERY_PAGE_SIZE } from "../domain/notification-limits";
import { createTaskReminderRepository } from "../infrastructure/task-reminder-repository";

export async function readPortableTaskReminders(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const reminders = createTaskReminderRepository();
  const records: TaskReminderRecord[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page = await reminders.listRecoveryPage(
      actor.userId,
      afterId,
      NOTIFICATION_RECOVERY_PAGE_SIZE,
      executor,
    );
    records.push(...page);
    if (page.length < NOTIFICATION_RECOVERY_PAGE_SIZE) break;
    afterId = page.at(-1)?.id ?? null;
    if (!afterId) break;
  }
  return { reminders: records.map(mapTaskReminder) } as const;
}
