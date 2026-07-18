import type { AuthenticatedActor } from "@/shared/auth/actor";

import { createIdentityApplication } from "./identity-application";
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

export function handleAuthRequest(request: Request) {
  return getApplication().handleAuthRequest(request);
}

export function resolveActor(headers: Headers) {
  return getApplication().resolveActor(headers);
}

export function updateUserPreferences(
  actor: AuthenticatedActor,
  expectedVersion: number,
  patch: UserPreferencesPatch,
) {
  return getApplication().updateUserPreferences(actor, expectedVersion, patch);
}
