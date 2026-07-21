import type { Metadata } from "next";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { AmethCompanion } from "@/modules/companion/presentation";
import { getInbox, getTasksApplication } from "@/modules/tasks";
import { TaskCommandPalette, TaskNavigation, TaskWorkspaceScreen } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../_load-workspace";

export const metadata: Metadata = { title: "Completed / cancelled" };
export const dynamic = "force-dynamic";

export default async function CompletedPage() {
  const workspace = await loadWorkspace("/completed");
  const tasks = getTasksApplication().tasks;
  const [inbox, initialCompleted, initialCancelled] = await Promise.all([
    getInbox(workspace.identity.actor),
    tasks.listTerminalTasks(workspace.identity.actor, { status: "completed", limit: 50 }),
    tasks.listTerminalTasks(workspace.identity.actor, { status: "cancelled", limit: 50 }),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="tasks"
      companion={<AmethCompanion />}
      destinationTitle="Completed / cancelled"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
      contextNavigation={<TaskNavigation current="completed" inboxId={inbox.id} />}
      compactNavigation={<TaskNavigation current="completed" inboxId={inbox.id} variant="compact" />}
    >
      <TaskWorkspaceScreen
        destination={{
          kind: "terminal",
          inbox,
          initialCompleted,
          initialCancelled,
          timeZone: workspace.preferences.timezone,
        }}
      />
    </AuthenticatedShell>
  );
}
