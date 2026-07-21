"use client";

import { Check, Repeat2, SkipForward, Undo2 } from "lucide-react";

import {
  canApplyOccurrenceResultOptimistically,
  type TaskDetailDto,
  type TaskOccurrenceDto,
} from "../application/contracts";
import { useTaskOccurrenceMutation, useTaskOccurrenceQuery } from "./data/use-task-occurrence";
import {
  formatOccurrenceSchedule,
  occurrenceErrorMessage,
  occurrenceStateLabel,
} from "./task-occurrence-labels";
import { classifyTaskWriteOutcome } from "./task-write-outcome";
import styles from "./TaskOccurrencePanel.module.css";
import { TaskOccurrencePanelFeedback } from "./TaskOccurrencePanelFeedback";
import { TaskOccurrenceUnavailable } from "./TaskOccurrenceUnavailable";
import { type OccurrenceTaskFreshness, useOccurrenceTaskFence } from "./use-occurrence-task-fence";

export function TaskOccurrencePanel({
  disabled,
  hourCycle,
  occurrence,
  task,
  taskFreshness,
}: Readonly<{
  disabled: boolean;
  hourCycle: "h12" | "h23";
  occurrence: TaskOccurrenceDto;
  task: TaskDetailDto;
  taskFreshness?: OccurrenceTaskFreshness | undefined;
}>) {
  const query = useTaskOccurrenceQuery(task.id, occurrence.occurrenceKey, occurrence, !disabled);
  const { data: current, error: queryError, isFetching, refetch } = query;
  const mutation = useTaskOccurrenceMutation(task.id, occurrence.occurrenceKey, () => undefined);
  const writeOutcome = mutation.error ? classifyTaskWriteOutcome(mutation.error) : null;
  const needsRecoveryChoice = writeOutcome === "unconfirmed";
  const aheadRetryVersion =
    mutation.data && !canApplyOccurrenceResultOptimistically(mutation.data)
      ? mutation.data.task.version
      : null;
  const awaitingAheadRetryRefresh =
    aheadRetryVersion !== null &&
    (task.version < aheadRetryVersion ||
      current === undefined ||
      (current !== null && current.taskVersion < aheadRetryVersion));
  const {
    refreshLatest,
    taskRefreshError,
    taskRefreshing,
    taskSnapshotAhead,
    taskSnapshotBehind,
    taskSnapshotMismatch,
  } = useOccurrenceTaskFence({
    occurrenceFetching: isFetching,
    occurrenceVersion: current?.taskVersion ?? null,
    refetchOccurrence: refetch,
    taskFreshness,
    taskVersion: task.version,
  });

  function refreshAuthoritativeSnapshots() {
    if (awaitingAheadRetryRefresh) {
      void Promise.all([refetch(), taskFreshness?.refetch()]);
      return;
    }
    refreshLatest();
  }

  if (current === null) {
    return (
      <TaskOccurrenceUnavailable
        taskId={task.id}
        loading={isFetching}
        onRetry={refreshAuthoritativeSnapshots}
        recovery={
          needsRecoveryChoice
            ? {
                continueDisabled: disabled || isFetching || taskRefreshing,
                message: occurrenceErrorMessage(writeOutcome, Boolean(queryError)),
                onContinue: () => mutation.reset(),
                onRetryExact: () => mutation.variables && mutation.mutate(mutation.variables),
                retryDisabled: disabled || mutation.isPending || !mutation.variables,
              }
            : undefined
        }
      />
    );
  }

  const selected = current ?? occurrence;
  const state = selected.occurrenceState;
  const ownerCanTransition = task.status === "open" && task.deletedAt === null;
  const refreshError = Boolean(
    queryError || (taskSnapshotBehind && taskRefreshError) || (awaitingAheadRetryRefresh && taskRefreshError),
  );
  const latestUnavailable = Boolean(mutation.error && refreshError);
  const unavailable =
    disabled ||
    mutation.isPending ||
    isFetching ||
    taskRefreshing ||
    taskSnapshotMismatch ||
    awaitingAheadRetryRefresh ||
    latestUnavailable ||
    needsRecoveryChoice;

  function transition(action: "complete" | "skip" | "undo") {
    mutation.mutate({
      action,
      occurrenceKey: selected.occurrenceKey,
      expectedVersion: selected.taskVersion,
    });
  }

  return (
    <section className={styles.group} aria-labelledby={`occurrence-title-${task.id}`}>
      <div className={styles.heading}>
        <div>
          <div className={styles.titleLine}>
            <h2 id={`occurrence-title-${task.id}`}>Selected occurrence</h2>
            <span className={styles.state} data-state={state}>
              {occurrenceStateLabel(state)}
            </span>
          </div>
          <p>{formatOccurrenceSchedule(selected.schedule, hourCycle)}</p>
        </div>
        <Repeat2 size={18} aria-hidden="true" />
      </div>
      <p className={styles.guidance}>
        {!ownerCanTransition
          ? "This occurrence is read-only because its series task is no longer open. Reopen the task before changing occurrence history."
          : state === "open" && !selected.transitionEligible
            ? "This preserved occurrence is outside the current series schedule. Its history remains visible, but it cannot be completed or skipped again."
            : "These actions change only this occurrence, not the series."}
      </p>
      <div className={styles.actions}>
        {state === "open" && selected.transitionEligible ? (
          <>
            <button
              className="secondary-button"
              type="button"
              disabled={unavailable}
              onClick={() => transition("complete")}
            >
              <Check size={16} aria-hidden="true" /> Complete occurrence
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={unavailable}
              onClick={() => transition("skip")}
            >
              <SkipForward size={16} aria-hidden="true" /> Skip occurrence
            </button>
          </>
        ) : state !== "open" && ownerCanTransition ? (
          <button
            className="secondary-button"
            type="button"
            disabled={unavailable}
            onClick={() => transition("undo")}
          >
            <Undo2 size={16} aria-hidden="true" /> Undo occurrence
          </button>
        ) : null}
      </div>
      <TaskOccurrencePanelFeedback
        awaitingAheadRetryRefresh={awaitingAheadRetryRefresh}
        disabled={disabled}
        hasExactRetry={Boolean(mutation.variables)}
        hasMutationError={Boolean(mutation.error)}
        latestUnavailable={latestUnavailable}
        mutationPending={mutation.isPending}
        mutationSuccessful={mutation.isSuccess}
        occurrenceFetching={isFetching}
        onContinueLatest={() => mutation.reset()}
        onRefreshLatest={refreshAuthoritativeSnapshots}
        onRetryExact={() => mutation.variables && mutation.mutate(mutation.variables)}
        recoveryRequired={needsRecoveryChoice}
        refreshError={refreshError}
        taskRefreshing={taskRefreshing}
        taskSnapshotAhead={taskSnapshotAhead}
        taskSnapshotBehind={taskSnapshotBehind}
        taskSnapshotMismatch={taskSnapshotMismatch}
        writeOutcome={writeOutcome}
      />
    </section>
  );
}
