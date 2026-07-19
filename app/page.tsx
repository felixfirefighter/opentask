import { headers } from "next/headers";

import { getOptionalSessionIdentity } from "@/modules/identity";
import { DemoEntryAction } from "@/modules/identity/presentation";
import { LandingScreen } from "@/modules/landing/presentation";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const identity = await getOptionalSessionIdentity(await headers());

  return <LandingScreen signedIn={identity !== null} demoAction={<DemoEntryAction />} />;
}
