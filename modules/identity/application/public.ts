import type { AuthenticatedActor } from "@/shared/auth/actor";

import { createIdentityApplication } from "./identity-application";
import type { OnboardingGoal } from "./contracts";
import { preferenceDocumentSchema } from "./preferences-contract";
import type { UserPreferencesPatch } from "./preferences-contract";
import { getProductionIdentityDependencies } from "../infrastructure/production-dependencies";

let application: ReturnType<typeof createIdentityApplication> | undefined;

function getApplication() {
  application ??= createIdentityApplication(getProductionIdentityDependencies());
  return application;
}

export function bootstrapAccount(userId: string) {
  return getApplication().bootstrapAccount(userId);
}

export function enterDemo(headers: Headers) {
  return getApplication().enterDemo(headers);
}

export function getOptionalSessionIdentity(headers: Headers) {
  return getApplication().getOptionalSessionIdentity(headers);
}

export function getIdentityRequestSecurity() {
  const trustedOrigin = getApplication().security.trustedOrigins[0];
  if (!trustedOrigin) throw new Error("Identity request security is not configured.");
  return { trustedOrigin } as const;
}

export function getUserPreferences(actor: AuthenticatedActor) {
  return getApplication().getUserPreferences(actor);
}

export function getOnboardingState(actor: AuthenticatedActor) {
  return getApplication().getOnboardingState(actor);
}

export function completeOnboarding(actor: AuthenticatedActor, goalsInput: readonly string[]) {
  const goals = preferenceDocumentSchema.shape.onboarding.shape.goals.parse(
    goalsInput,
  ) as readonly OnboardingGoal[];
  return getApplication().completeOnboarding(actor, goals);
}

export function recordCheckin(
  actor: AuthenticatedActor,
  mood: "good" | "tired" | "heavy" | "ready",
  note?: string,
) {
  return getApplication().recordCheckin(actor, mood, note);
}

export function handleAuthRequest(request: Request) {
  return getApplication().handleAuthRequest(request);
}

export function resolveActor(headers: Headers) {
  return getApplication().resolveActor(headers);
}

export function resetApp(actor: AuthenticatedActor) {
  return getApplication().resetApp(actor);
}

export function updateUserPreferences(
  actor: AuthenticatedActor,
  expectedVersion: number,
  patch: UserPreferencesPatch,
) {
  return getApplication().updateUserPreferences(actor, expectedVersion, patch);
}
