import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getOptionalSessionIdentity, getUserPreferences } from "@/modules/identity";

export async function loadWorkspace(returnTo: `/${string}`) {
  const identity = await getOptionalSessionIdentity(await headers());
  if (!identity) redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);

  return {
    identity,
    preferences: await getUserPreferences(identity.actor),
  };
}
