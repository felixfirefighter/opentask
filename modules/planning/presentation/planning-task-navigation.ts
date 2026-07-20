export function planningTaskDetailsHref(taskId: string, returnTo?: string | null) {
  if (!returnTo) return `/tasks/${taskId}`;
  return `/tasks/${taskId}?${new URLSearchParams({ returnTo }).toString()}`;
}
