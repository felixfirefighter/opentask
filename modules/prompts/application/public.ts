import type { AuthenticatedActor } from "@/shared/auth/actor";
import { getDatabase } from "@/shared/db/client";
import { systemClock } from "@/shared/time/clock";
import { savedPromptTags, savedPrompts } from "@/shared/db/schema";

import { createPromptApplication } from "./prompt-application";
import type { SavedPromptDraft, SavedPromptUpdate } from "./contracts";

let application: ReturnType<typeof createPromptApplication> | undefined;

function getApplication() {
  application ??= createPromptApplication({
    database: getDatabase(),
    clock: systemClock,
    tables: { savedPrompts, savedPromptTags },
  });
  return application;
}

export function assertPromptLibraryUnlocked(actor: AuthenticatedActor) {
  return getApplication().requireUnlocked(actor);
}

export function listSavedPrompts(actor: AuthenticatedActor, includeArchived?: boolean) {
  return getApplication().list(actor, includeArchived);
}
export function getSavedPrompt(actor: AuthenticatedActor, id: string) {
  return getApplication().get(actor, id);
}
export function createSavedPrompt(actor: AuthenticatedActor, draft: SavedPromptDraft) {
  return getApplication().create(actor, draft);
}
export function updateSavedPrompt(actor: AuthenticatedActor, id: string, update: SavedPromptUpdate) {
  return getApplication().update(actor, id, update);
}
export function removeSavedPrompt(actor: AuthenticatedActor, id: string) {
  return getApplication().remove(actor, id);
}
