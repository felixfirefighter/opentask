import type { Metadata } from "next";
import { ZodError } from "zod";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getInbox, getTasksApplication } from "@/modules/tasks";
import { TaskCommandPalette, TaskNavigation, TaskWorkspaceScreen } from "@/modules/tasks/presentation";
import { ApplicationError } from "@/shared/http/application-error";

import { loadWorkspace } from "../../_load-workspace";

export const metadata: Metadata = { title: "List" };
export const dynamic = "force-dynamic";

type RegularListPageProps = Readonly<{
  params: Promise<{ listId: string }>;
}>;

export default async function RegularListPage({ params }: RegularListPageProps) {
  const { listId } = await params;
  const workspace = await loadWorkspace(`/lists/${listId}`);
  const application = getTasksApplication();
  const [list, inbox] = await Promise.all([
    loadRegularList(workspace.identity.actor, listId, application),
    getInbox(workspace.identity.actor),
  ]);
  const initialTasks = list
    ? await application.tasks.listTasks(workspace.identity.actor, {
        listId: list.id,
        parentTaskId: null,
        status: "open",
        limit: 50,
      })
    : undefined;

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="tasks"
      destinationTitle={list?.name ?? "List unavailable"}
      topBarActions={<TaskCommandPalette inbox={inbox} {...(list ? { currentListId: list.id } : {})} />}
      contextNavigation={<TaskNavigation current={list ? { listId: list.id } : "inbox"} inboxId={inbox.id} />}
      compactNavigation={
        <TaskNavigation current={list ? { listId: list.id } : "inbox"} inboxId={inbox.id} variant="compact" />
      }
    >
      {list ? (
        <TaskWorkspaceScreen
          destination={{
            kind: "list",
            list,
            inbox,
            ...(initialTasks ? { initialTasks } : {}),
            timeZone: workspace.preferences.timezone,
            hourCycle: workspace.preferences.hourCycle,
          }}
        />
      ) : (
        <UnavailableList />
      )}
    </AuthenticatedShell>
  );
}

async function loadRegularList(
  actor: Parameters<ReturnType<typeof getTasksApplication>["lists"]["getRegularList"]>[0],
  listId: string,
  application: ReturnType<typeof getTasksApplication>,
) {
  try {
    return await application.lists.getRegularList(actor, listId);
  } catch (error) {
    if (isUnavailableResource(error)) return null;
    throw error;
  }
}

function isUnavailableResource(error: unknown): boolean {
  return error instanceof ZodError || (error instanceof ApplicationError && error.code === "NOT_FOUND");
}

function UnavailableList() {
  return (
    <section className="workspace-route-state" aria-labelledby="list-unavailable-title">
      <div>
        <p className="eyebrow">Tasks</p>
        <h1 id="list-unavailable-title" tabIndex={-1} data-route-focus>
          List unavailable
        </h1>
        <p>This list could not be found or you may not have access.</p>
      </div>
    </section>
  );
}
