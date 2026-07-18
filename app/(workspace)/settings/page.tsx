import type { Metadata } from "next";

import { AuthenticatedShell, SettingsScreen } from "@/modules/identity/presentation";

import { loadWorkspace } from "../_load-workspace";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await loadWorkspace("/settings");

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="settings"
    >
      <SettingsScreen initialPreferences={workspace.preferences} />
    </AuthenticatedShell>
  );
}
