"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { markWorkspaceRoutesStale } from "@/shared/presentation";

import {
  canApplyOccurrenceResultOptimistically,
  type OccurrenceCommandRequest,
  type OccurrenceCommandResult,
  type TaskDetailDto,
  type TaskOccurrenceDto,
  type TaskRecurrenceDto,
} from "../../application/contracts";
import { classifyTaskWriteOutcome } from "../task-write-outcome";
import { taskQueryKeys } from "./task-query-keys";
import { getTaskOccurrence, transitionTaskOccurrence } from "./task-occurrence-api-client";
import { taskRecurrenceQueryKey } from "./use-task-recurrence";

export const taskOccurrenceQueryRoot = (taskId: string) => ["tasks", "occurrence", taskId] as const;
export const taskOccurrenceQueryKey = (taskId: string, occurrenceKey: string) =>
  [...taskOccurrenceQueryRoot(taskId), occurrenceKey] as const;

export function useTaskOccurrenceQuery(
  taskId: string,
  occurrenceKey: string,
  initialData: TaskOccurrenceDto,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const queryKey = taskOccurrenceQueryKey(taskId, occurrenceKey);
  const query = useQuery({
    queryKey,
    queryFn: () => getTaskOccurrence(taskId, occurrenceKey),
    initialData,
    enabled,
  });
  const initialSnapshotIsNewer =
    query.data !== null && query.data !== undefined && initialData.taskVersion > query.data.taskVersion;
  const data = initialSnapshotIsNewer ? initialData : query.data;

  // A new route snapshot may restore a key that this mounted query previously
  // observed as unavailable. The effect is keyed to the server prop, so a
  // later same-mount refetch to null remains authoritative until RSC changes.
  useEffect(() => {
    queryClient.setQueryData<TaskOccurrenceDto | null>(
      taskOccurrenceQueryKey(taskId, occurrenceKey),
      (current) => (!current || initialData.taskVersion > current.taskVersion ? initialData : current),
    );
  }, [initialData, occurrenceKey, queryClient, taskId]);

  return { ...query, data };
}

export function useTaskOccurrenceMutation(
  taskId: string,
  occurrenceKey: string,
  onApplied: (result: OccurrenceCommandResult) => void,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const occurrenceQueryKey = taskOccurrenceQueryKey(taskId, occurrenceKey);
  return useMutation({
    mutationFn: (request: OccurrenceCommandRequest) => transitionTaskOccurrence(taskId, request),
    onError: (error) => {
      const outcome = classifyTaskWriteOutcome(error);
      if (outcome === "conflict" || outcome === "unconfirmed") markWorkspaceRoutesStale();
    },
    onSuccess: (result) => {
      if (canApplyOccurrenceResultOptimistically(result)) {
        queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(taskId), (current) =>
          current ? { ...current, version: result.task.version } : current,
        );
        queryClient.setQueryData<TaskOccurrenceDto | null>(occurrenceQueryKey, (current) =>
          current && current.occurrenceKey === result.occurrenceKey
            ? {
                ...current,
                taskVersion: result.task.version,
                occurrenceState: result.occurrenceState,
              }
            : current,
        );
        queryClient.setQueryData<TaskRecurrenceDto | null>(taskRecurrenceQueryKey(taskId), (current) =>
          current?.taskVersion === result.expectedVersion
            ? { ...current, taskVersion: result.task.version }
            : current,
        );
        onApplied(result);
      }
      markWorkspaceRoutesStale();
    },
    onSettled: async (_result, error) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) }),
        queryClient.invalidateQueries({ queryKey: taskOccurrenceQueryRoot(taskId) }),
        queryClient.invalidateQueries({ queryKey: taskRecurrenceQueryKey(taskId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.listRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
      if (!error || classifyTaskWriteOutcome(error) !== "unconfirmed") router.refresh();
    },
  });
}
