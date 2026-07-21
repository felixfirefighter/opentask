export function resolveSafeReturnTo(returnTo?: string | null): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return "/inbox";
  if (returnTo.includes("\\") || /[\u0000-\u001f\u007f]/u.test(returnTo)) return "/inbox";

  try {
    const base = new URL("https://omplish.invalid");
    const target = new URL(returnTo, base);
    if (target.origin !== base.origin) return "/inbox";
    if (target.pathname === "/api" || target.pathname.startsWith("/api/")) return "/inbox";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/inbox";
  }
}
