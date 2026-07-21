"use client";

import { WorkspaceRouteError } from "@/modules/identity/presentation";

export default function FocusError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <WorkspaceRouteError
      eyebrow="Focus"
      error={error}
      message="The authoritative timer could not be loaded. No timer data was changed."
      onRetry={reset}
      returnHref="/inbox"
      returnLabel="Back to Inbox"
      title="Focus unavailable"
    />
  );
}
