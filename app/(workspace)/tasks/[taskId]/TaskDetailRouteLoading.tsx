"use client";

import { useSearchParams } from "next/navigation";

import { WorkspaceLoadingShell } from "@/modules/identity/presentation";

import { readTaskDetailReturnHref } from "./task-detail-return";

export function TaskDetailRouteLoading() {
  const searchParams = useSearchParams();
  const returnHref = readTaskDetailReturnHref(searchParams.get("returnTo")) ?? "/inbox";
  return <WorkspaceLoadingShell detail label="Opening task details…" returnHref={returnHref} />;
}
