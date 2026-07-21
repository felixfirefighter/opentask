import {
  notificationIdSchema,
  removeTaskReminderRequestSchema,
  setTaskReminderRequestSchema,
} from "@/modules/notifications";
import { getReleaseApplications } from "@/server/release-applications";

import {
  assertNoNotificationApiQuery,
  notificationApiResponse,
  privateNotificationJson,
  readNotificationApiMutation,
  resolveNotificationApiActor,
} from "@/app/api/v1/notifications/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskReminderRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function GET(request: Request, context: TaskReminderRouteContext) {
  return notificationApiResponse(request, "notifications.get-reminder", async () => {
    const actor = await resolveNotificationApiActor(request);
    assertNoNotificationApiQuery(request);
    const taskId = notificationIdSchema.parse((await context.params).taskId);
    const reminder = await getReleaseApplications().notifications.getTaskReminder(actor, taskId);
    return privateNotificationJson(reminder);
  });
}

export function PUT(request: Request, context: TaskReminderRouteContext) {
  return notificationApiResponse(request, "notifications.set-reminder", async () => {
    const { actor, input } = await readNotificationApiMutation(request, setTaskReminderRequestSchema, "PUT");
    assertNoNotificationApiQuery(request);
    const taskId = notificationIdSchema.parse((await context.params).taskId);
    const reminder = await getReleaseApplications().notifications.setTaskReminder(actor, {
      ...input,
      taskId,
    });
    return privateNotificationJson(reminder);
  });
}

export function DELETE(request: Request, context: TaskReminderRouteContext) {
  return notificationApiResponse(request, "notifications.remove-reminder", async () => {
    const { actor, input } = await readNotificationApiMutation(
      request,
      removeTaskReminderRequestSchema,
      "DELETE",
    );
    assertNoNotificationApiQuery(request);
    const taskId = notificationIdSchema.parse((await context.params).taskId);
    await getReleaseApplications().notifications.removeTaskReminder(actor, { ...input, taskId });
    return privateNotificationJson({ removed: true });
  });
}
