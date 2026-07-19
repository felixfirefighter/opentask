import type { Metadata } from "next";

import { getPlannerCapability } from "@/modules/assistant";
import { AssistantPlannerRouteScreen, type PlannerTaskOption } from "@/modules/assistant/presentation";
import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getPlanningProjectionApplication, type EisenhowerProjection } from "@/modules/planning";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "AI Review" };
export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const workspace = await loadWorkspace("/plan");
  const planning = getPlanningProjectionApplication();
  const [inbox, today, matrix] = await Promise.all([
    getInbox(workspace.identity.actor),
    planning.getToday(workspace.identity.actor, { limit: 1 }),
    planning.getEisenhower(workspace.identity.actor, { limit: 500 }),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="plan"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
    >
      <AssistantPlannerRouteScreen
        capability={getPlannerCapability()}
        tasks={unscheduledOptions(matrix)}
        initialInput={{
          brainDump: "",
          selectedTaskIds: [],
          planningDate: today.localDate,
          timeZone: workspace.preferences.timezone,
          workWindow: { start: "09:00", end: "17:00" },
          defaultDurationMinutes: 30,
          bufferMinutes: 10,
        }}
      />
    </AuthenticatedShell>
  );
}

function unscheduledOptions(matrix: EisenhowerProjection): PlannerTaskOption[] {
  return [...matrix.doNow, ...matrix.plan, ...matrix.timeSensitive, ...matrix.later]
    .filter((task) => task.schedule === null)
    .map(({ id, priority, title }) => ({ id, priority, title }))
    .sort((left, right) => left.title.localeCompare(right.title));
}
