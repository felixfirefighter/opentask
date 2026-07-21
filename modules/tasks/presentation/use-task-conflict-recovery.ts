"use client";

import type { TaskDetailDto, TaskListItemDto } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import { useTaskDetailQuery } from "./data/use-task-queries";
import { classifyTaskWriteOutcome } from "./task-write-outcome";

export function useTaskConflictRecovery(task: TaskDetailDto | TaskListItemDto, error: unknown) {
  const outcome = error ? classifyTaskWriteOutcome(error) : null;
  const conflictError = isTaskApiError(error) && error.code === "CONFLICT" ? error : null;
  const needsLatest = outcome === "conflict" || outcome === "unconfirmed";
  const query = useTaskDetailQuery(task.id, undefined, needsLatest);
  const latestTask = query.data ?? task;
  const expectedVersion = conflictError?.currentVersion;
  const versionReady = expectedVersion === undefined || latestTask.version >= expectedVersion;
  const latestQueryReady = needsLatest && query.isSuccess && !query.isFetching;
  const latestReady = needsLatest && query.isSuccess && !query.isFetching && versionReady;

  return {
    conflict: outcome === "conflict",
    expectedVersion,
    latestReady,
    latestQueryReady,
    latestQueryUnavailable: needsLatest && !query.isFetching && !query.isSuccess,
    latestTask,
    loadingLatest: needsLatest && query.isFetching,
    latestUnavailable: needsLatest && !query.isFetching && (!query.isSuccess || !versionReady),
    needsLatest,
    outcome,
    refetchLatest: query.refetch,
    unconfirmed: outcome === "unconfirmed",
  } as const;
}
