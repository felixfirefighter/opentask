import type { Metadata } from "next";
import { ZodError } from "zod";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getInbox, getTasksApplication, occurrenceKeySchema } from "@/modules/tasks";
import { TaskCommandPalette, TaskDetailScreen, TaskNavigation } from "@/modules/tasks/presentation";
import { ApplicationError } from "@/shared/http/application-error";

import { loadWorkspace } from "../../_load-workspace";
import { readTaskDetailReturnHref } from "./task-detail-return";

export const metadata: Metadata = { title: "Task details" };
export const dynamic = "force-dynamic";

type TaskDetailPageProps = Readonly<{
  params: Promise<{ taskId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function TaskDetailPage({ params, searchParams }: TaskDetailPageProps) {
  const { taskId } = await params;
  const request = await searchParams;
  const requestedReturnTo = readTaskDetailReturnHref(request.returnTo);
  const requestedOccurrence = readOccurrence(request);
  const initialEditSchedule = request.edit === "series-schedule";
  const taskRouteQuery = new URLSearchParams();
  if (requestedReturnTo) taskRouteQuery.set("returnTo", requestedReturnTo);
  if (requestedOccurrence) taskRouteQuery.set("occurrence", requestedOccurrence);
  if (initialEditSchedule) taskRouteQuery.set("edit", "series-schedule");
  const taskRoute =
    `/tasks/${taskId}${taskRouteQuery.size > 0 ? `?${taskRouteQuery.toString()}` : ""}` as `/${string}`;
  const workspace = await loadWorkspace(taskRoute);
  const [task, inbox, occurrence] = await Promise.all([
    loadTask(workspace.identity.actor, taskId),
    getInbox(workspace.identity.actor),
    requestedOccurrence
      ? getTasksApplication().occurrences.readOccurrence(
          workspace.identity.actor,
          taskId,
          requestedOccurrence,
        )
      : null,
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="tasks"
      destinationTitle="Task details"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
      contextNavigation={
        <TaskNavigation
          current={task && task.listId !== inbox.id ? { listId: task.listId } : "inbox"}
          inboxId={inbox.id}
        />
      }
      compactNavigation={
        <TaskNavigation
          current={task && task.listId !== inbox.id ? { listId: task.listId } : "inbox"}
          inboxId={inbox.id}
          variant="compact"
        />
      }
      mobileNavigation={null}
    >
      {task ? (
        <TaskDetailScreen
          task={task}
          mode="page"
          inbox={inbox}
          hourCycle={workspace.preferences.hourCycle}
          initialEditSchedule={initialEditSchedule}
          occurrence={occurrence}
          occurrenceRequested={requestedOccurrence !== null}
          returnHref={requestedReturnTo ?? (task.listId === inbox.id ? "/inbox" : `/lists/${task.listId}`)}
        />
      ) : (
        <UnavailableTask returnHref={requestedReturnTo ?? "/inbox"} />
      )}
    </AuthenticatedShell>
  );
}

function readOccurrence(searchParams: Record<string, string | string[] | undefined>): string | null {
  const parsed = occurrenceKeySchema.safeParse(searchParams.occurrence);
  return parsed.success ? parsed.data : null;
}

async function loadTask(
  actor: Parameters<ReturnType<typeof getTasksApplication>["tasks"]["getTask"]>[0],
  taskId: string,
) {
  try {
    return await getTasksApplication().tasks.getTask(actor, taskId);
  } catch (error) {
    if (isUnavailableResource(error)) return null;
    throw error;
  }
}

function isUnavailableResource(error: unknown): boolean {
  return error instanceof ZodError || (error instanceof ApplicationError && error.code === "NOT_FOUND");
}

function UnavailableTask({ returnHref }: Readonly<{ returnHref: string }>) {
  return (
    <section className="workspace-route-state" aria-labelledby="task-unavailable-title">
      <div>
        <p className="eyebrow">Tasks</p>
        <h1 id="task-unavailable-title" tabIndex={-1} data-route-focus>
          Task unavailable
        </h1>
        <p>This task could not be found or you may not have access.</p>
        <a className="secondary-button" href={returnHref}>
          Back to tasks
        </a>
      </div>
    </section>
  );
}
