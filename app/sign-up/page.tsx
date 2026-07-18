import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getOptionalSessionIdentity } from "@/modules/identity";
import { AuthScreen, resolveSafeReturnTo } from "@/modules/identity/presentation";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const returnTo = readReturnTo(await searchParams);
  const identity = await getOptionalSessionIdentity(await headers());
  if (identity) redirect(resolveSafeReturnTo(returnTo));

  return <AuthScreen mode="sign-up" returnTo={returnTo} />;
}

function readReturnTo(searchParams: Record<string, string | string[] | undefined>) {
  return typeof searchParams.returnTo === "string" ? searchParams.returnTo : null;
}
