import type { Metadata } from "next";

import { getFocusApplication } from "@/modules/focus";
import { FocusRouteScreen } from "@/modules/focus/presentation";
import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Focus" };
export const dynamic = "force-dynamic";

export default async function FocusPage() {
  const workspace = await loadWorkspace("/focus");
  const actor = workspace.identity.actor;
  const application = getFocusApplication();
  const [inbox, active] = await Promise.all([
    getInbox(actor),
    application.getActiveFocusSession(actor).catch(() => undefined),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="focus"
      destinationTitle="Focus"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
    >
      <FocusRouteScreen
        hourCycle={workspace.preferences.hourCycle}
        {...(active !== undefined ? { initialActive: active } : {})}
        timeZone={workspace.preferences.timezone}
      />
    </AuthenticatedShell>
  );
}
