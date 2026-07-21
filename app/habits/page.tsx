import type { Metadata } from "next";

import { getHabitsApplication } from "@/modules/habits";
import { HabitNavigation, HabitWorkspaceRouteScreen } from "@/modules/habits/presentation";
import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getPlanningProjectionApplication } from "@/modules/planning";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Habits" };
export const dynamic = "force-dynamic";

type HabitPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function HabitPage({ searchParams }: HabitPageProps) {
  const lifecycle = readHabitLifecycle((await searchParams).view);
  const route = lifecycle === "archived" ? "/habits?view=archived" : "/habits";
  const workspace = await loadWorkspace(route);
  const actor = workspace.identity.actor;
  const [inbox, overviews, today] = await Promise.all([
    getInbox(actor),
    getHabitsApplication().projections.listHabitOverviews(actor, { lifecycle, limit: 50 }),
    getPlanningProjectionApplication().getToday(actor, { limit: 1 }),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="habits"
      destinationTitle={lifecycle === "archived" ? "Archived habits" : "Habits"}
      topBarActions={<TaskCommandPalette inbox={inbox} />}
      contextNavigation={<HabitNavigation current={lifecycle} />}
      compactNavigation={<HabitNavigation current={lifecycle} variant="compact" />}
    >
      <HabitWorkspaceRouteScreen
        initialPage={overviews}
        lifecycle={lifecycle}
        localDate={today.localDate}
        timezone={workspace.preferences.timezone}
      />
    </AuthenticatedShell>
  );
}

function readHabitLifecycle(value: string | string[] | undefined): "active" | "archived" {
  return value === "archived" ? "archived" : "active";
}
