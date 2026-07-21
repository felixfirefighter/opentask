import type { Metadata } from "next";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { AmethCompanion } from "@/modules/companion/presentation";
import { getPlanningProjectionApplication } from "@/modules/planning";
import { TodayRouteScreen } from "@/modules/planning/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette, TaskNavigation } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const workspace = await loadWorkspace("/today");
  const [inbox, projection] = await Promise.all([
    getInbox(workspace.identity.actor),
    getPlanningProjectionApplication().getToday(workspace.identity.actor, { limit: 250 }),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="today"
      companion={<AmethCompanion />}
      topBarActions={<TaskCommandPalette inbox={inbox} currentListId={inbox.id} />}
      contextNavigation={<TaskNavigation current="today" inboxId={inbox.id} />}
      compactNavigation={<TaskNavigation current="today" inboxId={inbox.id} variant="compact" />}
    >
      <TodayRouteScreen
        projection={projection}
        inboxId={inbox.id}
        hourCycle={workspace.preferences.hourCycle === "h12" ? "12" : "24"}
      />
    </AuthenticatedShell>
  );
}
