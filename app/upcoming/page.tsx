import type { Metadata } from "next";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getPlanningProjectionApplication } from "@/modules/planning";
import { UpcomingRouteScreen } from "@/modules/planning/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette, TaskNavigation } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Upcoming" };
export const dynamic = "force-dynamic";

export default async function UpcomingPage() {
  const workspace = await loadWorkspace("/upcoming");
  const [inbox, projection] = await Promise.all([
    getInbox(workspace.identity.actor),
    getPlanningProjectionApplication().getUpcoming(workspace.identity.actor, { limit: 250 }),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="tasks"
      destinationTitle="Upcoming"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
      contextNavigation={<TaskNavigation current="upcoming" inboxId={inbox.id} />}
      compactNavigation={<TaskNavigation current="upcoming" inboxId={inbox.id} variant="compact" />}
    >
      <UpcomingRouteScreen
        projection={projection}
        hourCycle={workspace.preferences.hourCycle === "h12" ? "12" : "24"}
      />
    </AuthenticatedShell>
  );
}
