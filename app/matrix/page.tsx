import type { Metadata } from "next";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getPlanningProjectionApplication } from "@/modules/planning";
import { MatrixRouteScreen } from "@/modules/planning/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette, TaskNavigation } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Priority matrix" };
export const dynamic = "force-dynamic";

export default async function MatrixPage() {
  const workspace = await loadWorkspace("/matrix");
  const [inbox, projection] = await Promise.all([
    getInbox(workspace.identity.actor),
    getPlanningProjectionApplication().getEisenhower(workspace.identity.actor, { limit: 500 }),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="tasks"
      destinationTitle="Priority matrix"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
      contextNavigation={<TaskNavigation current="matrix" inboxId={inbox.id} />}
      compactNavigation={<TaskNavigation current="matrix" inboxId={inbox.id} variant="compact" />}
    >
      <MatrixRouteScreen
        projection={projection}
        hourCycle={workspace.preferences.hourCycle === "h12" ? "12" : "24"}
      />
    </AuthenticatedShell>
  );
}
