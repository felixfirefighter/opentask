import type { Metadata } from "next";

import { getPlannerCapability } from "@/modules/assistant";
import { AuthenticatedShell, SettingsScreen } from "@/modules/identity/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../_load-workspace";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await loadWorkspace("/settings");
  const inbox = await getInbox(workspace.identity.actor);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="settings"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
    >
      <SettingsScreen aiCapability={getPlannerCapability()} initialPreferences={workspace.preferences} />
    </AuthenticatedShell>
  );
}
