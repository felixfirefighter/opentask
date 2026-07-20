const TASK_RETURN_DESTINATIONS = new Set([
  "/inbox",
  "/today",
  "/upcoming",
  "/calendar",
  "/matrix",
  "/plan",
  "/completed",
  "/settings",
]);

export function readTaskDetailReturnHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const target = new URL(value, "http://opentask.local");
    if (target.origin !== "http://opentask.local" || target.username || target.password) return null;
    if (!isTaskReturnPath(target.pathname)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

function isTaskReturnPath(pathname: string): boolean {
  if (TASK_RETURN_DESTINATIONS.has(pathname)) return true;
  return /^\/lists\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    pathname,
  );
}
