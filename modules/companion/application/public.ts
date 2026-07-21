import type { AuthenticatedActor } from "@/shared/auth/actor";
import { getDatabase } from "@/shared/db/client";
import { systemClock } from "@/shared/time/clock";
import { Temporal } from "temporal-polyfill";
import {
  companionBehaviorSummaries,
  companionMemories,
  companionProfiles,
  companionXpEvents,
} from "@/shared/db/schema";

import { createCompanionApplication } from "./companion-application";
import type { CompanionActionType, CompanionChatRequest, CompanionPreferencePatch } from "./contracts";

let application: ReturnType<typeof createCompanionApplication> | undefined;

function getApplication() {
  application ??= createCompanionApplication({
    database: getDatabase(),
    clock: systemClock,
    tables: { companionProfiles, companionXpEvents, companionBehaviorSummaries, companionMemories },
  });
  return application;
}

export function awardCompanionXp(
  actor: AuthenticatedActor,
  input: { actionType: CompanionActionType; sourceKey: string; xp: number },
  executor?: Parameters<ReturnType<typeof createCompanionApplication>["award"]>[2],
) {
  return localDateForActor(actor).then((localDate) =>
    getApplication().award(actor, { ...input, localDate }, executor),
  );
}
export function getCompanionState(actor: AuthenticatedActor) {
  return localDateForActor(actor).then((localDate) => getApplication().getState(actor, localDate));
}
export function updateCompanionPreferences(
  actor: AuthenticatedActor,
  expectedVersion: number,
  patch: CompanionPreferencePatch,
) {
  return localDateForActor(actor).then((localDate) =>
    getApplication().updatePreferences(actor, expectedVersion, patch, localDate),
  );
}
export function refreshCompanionSummary(actor: AuthenticatedActor) {
  return localDateForActor(actor).then((localDate) => getApplication().refreshSummary(actor, localDate));
}
export function createCompanionChat(actor: AuthenticatedActor, input: CompanionChatRequest) {
  return localDateForActor(actor).then((localDate) => getApplication().chat(actor, input, localDate));
}
export function deleteCompanionData(actor: AuthenticatedActor) {
  return getApplication().deleteData(actor);
}
export function saveCompanionMemory(actor: AuthenticatedActor, input: unknown) {
  return getApplication().saveMemory(actor, input);
}
export function removeCompanionMemory(actor: AuthenticatedActor, memoryId: string) {
  return getApplication().removeMemory(actor, memoryId);
}
export function setCompanionDailyMode(actor: AuthenticatedActor, mode: "warm" | "focused" | "direct") {
  return localDateForActor(actor).then((localDate) => getApplication().setDailyMode(actor, mode, localDate));
}

async function localDateForActor(actor: AuthenticatedActor): Promise<string> {
  const { getUserPreferences } = await import("@/modules/identity");
  const preferences = await getUserPreferences(actor);
  return Temporal.Instant.from(systemClock.now().toISOString())
    .toZonedDateTimeISO(preferences.timezone)
    .toPlainDate()
    .toString();
}
