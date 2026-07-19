"use client";

import { WorkspaceRouteError } from "@/modules/identity/presentation";

export default function ApplicationError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <WorkspaceRouteError error={error} onRetry={reset} />;
}
