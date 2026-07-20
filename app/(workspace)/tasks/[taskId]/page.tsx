import type { Metadata } from "next";
import { ZodError } from "zod";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getInbox, getTasksApplication } from "@/modules/tasks";
import { TaskCommandPalette, TaskDetailScreen, TaskNavigation } from "@/modules/tasks/presentation";
import { ApplicationError } from "@/shared/http/application-error";

import { loadWorkspace } from "../../_load-workspace";

export const metadata: Metadata = { title: "Task details" };
export const dynamic = "force-dynamic";

type TaskDetailPageProps = Readonly<{
  params: Promise<{ taskId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function TaskDetailPage({ params, searchParams }: TaskDetailPageProps) {
  const { taskId } = await params;
  const requestedReturnTo = readReturnTo(await searchParams);
  const taskRoute = requestedReturnTo
    ? (`/tasks/${taskId}?returnTo=${encodeURIComponent(requestedReturnTo)}` as const)
    : (`/tasks/${taskId}` as const);
  const workspace = await loadWorkspace(taskRoute);
  const [task, inbox] = await Promise.all([
    loadTask(workspace.identity.actor, taskId),
    getInbox(workspace.identity.actor),
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
          returnHref={requestedReturnTo ?? (task.listId === inbox.id ? "/inbox" : `/lists/${task.listId}`)}
        />
      ) : (
        <UnavailableTask />
      )}
    </AuthenticatedShell>
  );
}

function readReturnTo(searchParams: Record<string, string | string[] | undefined>): string | null {
  const value = searchParams.returnTo;
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const target = new URL(value, "http://opentask.local");
    if (target.origin !== "http://opentask.local" || target.username || target.password) return null;
    if (!isTaskReturnPath(target.pathname)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

function isTaskReturnPath(pathname: string): boolean {
  if (
    ["/inbox", "/today", "/upcoming", "/calendar", "/matrix", "/plan", "/completed", "/settings"].includes(
      pathname,
    )
  ) {
    return true;
  }
  return /^\/lists\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    pathname,
  );
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

function UnavailableTask() {
  return (
    <section className="workspace-route-state" aria-labelledby="task-unavailable-title">
      <div>
        <p className="eyebrow">Tasks</p>
        <h1 id="task-unavailable-title" tabIndex={-1} data-route-focus>
          Task unavailable
        </h1>
        <p>This task could not be found or you may not have access.</p>
      </div>
    </section>
  );
}
