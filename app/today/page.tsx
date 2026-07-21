import type { Metadata } from "next";

import { getHabitsApplication } from "@/modules/habits";
import { TodayHabitsRouteSection } from "@/modules/habits/presentation";
import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getPlanningProjectionApplication } from "@/modules/planning";
import { TodayRouteScreen } from "@/modules/planning/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette, TaskNavigation } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const workspace = await loadWorkspace("/today");
  const [inbox, projection, habitProjection] = await Promise.all([
    getInbox(workspace.identity.actor),
    getPlanningProjectionApplication().getToday(workspace.identity.actor, { limit: 250 }),
    getHabitsApplication()
      .projections.getHabitToday(workspace.identity.actor, { limit: 50 })
      .catch(() => undefined),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="today"
      topBarActions={<TaskCommandPalette inbox={inbox} currentListId={inbox.id} />}
      contextNavigation={<TaskNavigation current="today" inboxId={inbox.id} />}
      compactNavigation={<TaskNavigation current="today" inboxId={inbox.id} variant="compact" />}
    >
      <TodayRouteScreen
        projection={projection}
        habitSection={
          habitProjection === undefined ? (
            <TodayHabitsRouteSection />
          ) : (
            <TodayHabitsRouteSection initialProjection={habitProjection} />
          )
        }
        inboxId={inbox.id}
        hourCycle={workspace.preferences.hourCycle === "h12" ? "12" : "24"}
      />
    </AuthenticatedShell>
  );
}
