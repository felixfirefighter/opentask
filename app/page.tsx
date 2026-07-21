import { ProfileSetupLauncher, resolveSafeReturnTo } from "@/modules/identity/presentation";

export default async function AppLaunchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const resumeTo = typeof params.resume === "string" ? resolveSafeReturnTo(params.resume) : null;

  return <ProfileSetupLauncher resumeTo={resumeTo} />;
}
