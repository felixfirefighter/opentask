import type { Metadata } from "next";
import { ZodError } from "zod";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { AmethCompanion } from "@/modules/companion/presentation";
import { getInbox, getTasksApplication } from "@/modules/tasks";
import { TaskCommandPalette, TaskDetailScreen, TaskNavigation } from "@/modules/tasks/presentation";
import { ApplicationError } from "@/shared/http/application-error";

import { loadWorkspace } from "../../_load-workspace";

export const metadata: Metadata = { title: "Task details" };
export const dynamic = "force-dynamic";

type TaskDetailPageProps = Readonly<{
  params: Promise<{ taskId: string }>;
}>;

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params;
  const workspace = await loadWorkspace(`/tasks/${taskId}`);
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
      companion={<AmethCompanion />}
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
          returnHref={task.listId === inbox.id ? "/inbox" : `/lists/${task.listId}`}
        />
      ) : (
        <UnavailableTask />
      )}
    </AuthenticatedShell>
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
