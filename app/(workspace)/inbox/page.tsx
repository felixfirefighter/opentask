import type { Metadata } from "next";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { AmethCompanion } from "@/modules/companion/presentation";
import { getInbox, getTasksApplication } from "@/modules/tasks";
import { TaskCommandPalette, TaskNavigation, TaskWorkspaceScreen } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../_load-workspace";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const workspace = await loadWorkspace("/inbox");
  const inbox = await getInbox(workspace.identity.actor);
  const initialTasks = await getTasksApplication().tasks.listTasks(workspace.identity.actor, {
    listId: inbox.id,
    parentTaskId: null,
    status: "open",
    limit: 50,
  });

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="tasks"
      companion={<AmethCompanion />}
      destinationTitle="Inbox"
      topBarActions={<TaskCommandPalette inbox={inbox} currentListId={inbox.id} />}
      contextNavigation={<TaskNavigation current="inbox" inboxId={inbox.id} />}
      compactNavigation={<TaskNavigation current="inbox" inboxId={inbox.id} variant="compact" />}
    >
      <TaskWorkspaceScreen
        destination={{ kind: "list", list: inbox, inbox, immutableInbox: true, initialTasks }}
      />
    </AuthenticatedShell>
  );
}
