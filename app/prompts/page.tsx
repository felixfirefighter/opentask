import type { Metadata } from "next";

import { AmethCompanion } from "@/modules/companion/presentation";
import { AuthenticatedShell } from "@/modules/identity/presentation";
import { listSavedPrompts } from "@/modules/prompts";
import { PromptLibrary } from "@/modules/prompts/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Prompt Library" };
export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const workspace = await loadWorkspace("/prompts");
  const [prompts, inbox] = await Promise.all([
    listSavedPrompts(workspace.identity.actor),
    getInbox(workspace.identity.actor),
  ]);
  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="prompts"
      companion={<AmethCompanion />}
      topBarActions={<TaskCommandPalette inbox={inbox} />}
    >
      <PromptLibrary initialPrompts={prompts} />
    </AuthenticatedShell>
  );
}
