"use client";

import { WorkspaceRouteError } from "@/modules/identity/presentation";

export default function HabitDetailError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <WorkspaceRouteError
      eyebrow="Habits"
      error={error}
      message="Habit details could not be loaded. Your data was not changed."
      onRetry={reset}
      returnHref="/habits"
      returnLabel="Back to habits"
      title="Habit unavailable"
    />
  );
}
