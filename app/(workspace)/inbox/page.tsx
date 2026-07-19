import type { Metadata } from "next";

import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getInbox } from "@/modules/tasks";
import { InboxScreen } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../_load-workspace";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const workspace = await loadWorkspace("/inbox");
  const inbox = await getInbox(workspace.identity.actor);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="tasks"
      destinationTitle="Inbox"
    >
      <InboxScreen summary={inbox} />
    </AuthenticatedShell>
  );
}
