import type { Metadata } from "next";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getPlanningProjectionApplication } from "@/modules/planning";
import { CalendarRouteScreen, readCalendarRouteState } from "@/modules/planning/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const workspace = await loadWorkspace("/calendar");
  const application = getPlanningProjectionApplication();
  const today = await application.getToday(workspace.identity.actor, { limit: 1 });
  const route = readCalendarRouteState(await searchParams, today.localDate, workspace.preferences.weekStart);
  const [inbox, projection] = await Promise.all([
    getInbox(workspace.identity.actor),
    application.getCalendarRange(workspace.identity.actor, {
      rangeStartDate: route.rangeStartDate,
      rangeEndDate: route.rangeEndDate,
      limit: 500,
    }),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="calendar"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
    >
      <CalendarRouteScreen
        projection={projection}
        inboxId={inbox.id}
        inboxName={inbox.name}
        view={route.view}
        hasSavedView={route.hasSavedView}
        initialDate={route.initialDate}
        weekStartsOn={workspace.preferences.weekStart}
        hourCycle={workspace.preferences.hourCycle === "h12" ? "12" : "24"}
      />
    </AuthenticatedShell>
  );
}
