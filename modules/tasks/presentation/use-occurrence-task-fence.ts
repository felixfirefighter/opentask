import { useEffect, useRef } from "react";

export type OccurrenceTaskFreshness = Readonly<{
  error: boolean;
  fetching: boolean;
  refetch: () => Promise<unknown>;
}>;

export function useOccurrenceTaskFence({
  occurrenceFetching,
  occurrenceVersion,
  refetchOccurrence,
  taskFreshness,
  taskVersion,
}: Readonly<{
  occurrenceFetching: boolean;
  occurrenceVersion: number | null;
  refetchOccurrence: () => Promise<unknown>;
  taskFreshness?: OccurrenceTaskFreshness | undefined;
  taskVersion: number;
}>) {
  const refetchTask = taskFreshness?.refetch;
  const taskRefreshError = taskFreshness?.error ?? false;
  const taskRefreshing = taskFreshness?.fetching ?? false;
  const taskSnapshotAhead = occurrenceVersion !== null && taskVersion > occurrenceVersion;
  const taskSnapshotBehind = occurrenceVersion !== null && taskVersion < occurrenceVersion;
  const taskSnapshotMismatch = taskSnapshotAhead || taskSnapshotBehind;
  const refreshAttempt = useRef<string | null>(null);

  useEffect(() => {
    if (!taskSnapshotMismatch) {
      refreshAttempt.current = null;
      return;
    }
    const attempt = `${taskVersion}:${occurrenceVersion ?? "missing"}`;
    if (refreshAttempt.current === attempt) return;
    refreshAttempt.current = attempt;
    if (taskSnapshotAhead && !occurrenceFetching) void refetchOccurrence();
    if (taskSnapshotBehind && !taskRefreshing) void refetchTask?.();
  }, [
    occurrenceFetching,
    occurrenceVersion,
    refetchOccurrence,
    refetchTask,
    taskRefreshing,
    taskSnapshotAhead,
    taskSnapshotBehind,
    taskSnapshotMismatch,
    taskVersion,
  ]);

  function refreshLatest() {
    refreshAttempt.current = null;
    if (taskSnapshotBehind) void refetchTask?.();
    else void refetchOccurrence();
  }

  return {
    refreshLatest,
    taskRefreshError,
    taskRefreshing,
    taskSnapshotAhead,
    taskSnapshotBehind,
    taskSnapshotMismatch,
  } as const;
}
