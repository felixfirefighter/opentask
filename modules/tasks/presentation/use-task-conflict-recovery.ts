"use client";

import type { TaskDetailDto, TaskListItemDto } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import { useTaskDetailQuery } from "./data/use-task-queries";

export function useTaskConflictRecovery(task: TaskDetailDto | TaskListItemDto, error: unknown) {
  const conflictError = isTaskApiError(error) && error.code === "CONFLICT" ? error : null;
  const query = useTaskDetailQuery(task.id, undefined, conflictError !== null);
  const latestTask = query.data ?? task;
  const expectedVersion = conflictError?.currentVersion;
  const versionReady = expectedVersion === undefined || latestTask.version >= expectedVersion;
  const latestReady = conflictError !== null && query.isSuccess && !query.isFetching && versionReady;

  return {
    conflict: conflictError !== null,
    expectedVersion,
    latestReady,
    latestTask,
    loadingLatest: conflictError !== null && query.isFetching,
    latestUnavailable: conflictError !== null && !query.isFetching && (!query.isSuccess || !versionReady),
    refetchLatest: query.refetch,
  } as const;
}
