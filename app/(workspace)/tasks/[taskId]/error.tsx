"use client";

import { useSearchParams } from "next/navigation";

import { WorkspaceRouteError } from "@/modules/identity/presentation";

import { readTaskDetailReturnHref } from "./task-detail-return";

export default function TaskDetailError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const searchParams = useSearchParams();
  const returnHref = readTaskDetailReturnHref(searchParams.get("returnTo")) ?? "/inbox";

  return (
    <WorkspaceRouteError
      error={error}
      eyebrow="Tasks"
      title="Task unavailable"
      message="Task details could not be loaded. Your data was not changed."
      onRetry={reset}
      returnHref={returnHref}
      returnLabel="Back to tasks"
    />
  );
}
