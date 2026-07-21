"use client";

import { WorkspaceRouteError } from "@/modules/identity/presentation";

export default function HabitError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <WorkspaceRouteError
      eyebrow="Habits"
      error={error}
      message="Habit definitions could not be loaded. Your data was not changed."
      onRetry={reset}
      returnHref="/inbox"
      returnLabel="Back to Inbox"
      title="Habits unavailable"
    />
  );
}
