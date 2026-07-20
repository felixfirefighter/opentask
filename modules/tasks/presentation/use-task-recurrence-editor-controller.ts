"use client";

import { useCallback, useState } from "react";

import type { TaskDetailDto, TaskScheduleValue } from "../application/contracts";
import type { RecurrenceDefinition, TaskRecurrenceDto } from "../application/contracts/recurrence-contract";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";
import {
  createTaskRecurrenceDraft,
  formatRecurrenceSummary,
  interpretTaskRecurrenceDraft,
  type TaskRecurrenceDraft,
} from "./task-recurrence-form-policy";
import { recurrenceAttemptMatches, snapshotTaskSchedule } from "./task-recurrence-recovery-policy";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useSchedulePreferencesQuery, useTaskScheduleQuery } from "./data/use-task-schedule";
import { useTaskRecurrenceMutation, useTaskRecurrenceQuery } from "./data/use-task-recurrence";
import { useTaskRecurrenceVersionFence } from "./use-task-recurrence-version-fence";

type RecurrenceAttempt = "save" | "end";

export function useTaskRecurrenceEditorController(task: TaskDetailDto, disabled: boolean) {
  const recurrenceQuery = useTaskRecurrenceQuery(task.id, task.parentTaskId === null);
  const scheduleQuery = useTaskScheduleQuery(task.id);
  const preferencesQuery = useSchedulePreferencesQuery();
  const mutation = useTaskRecurrenceMutation();
  const recovery = useTaskConflictRecovery(task, mutation.error);
  const refetchLatestTask = recovery.refetchLatest;
  const refetchRecurrence = recurrenceQuery.refetch;
  const refetchSchedule = scheduleQuery.refetch;
  const refetchAuthoritativeState = useCallback(
    () => Promise.all([refetchLatestTask(), refetchRecurrence(), refetchSchedule()]),
    [refetchLatestTask, refetchRecurrence, refetchSchedule],
  );
  const [draft, setDraft] = useState<TaskRecurrenceDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [lastAttempt, setLastAttempt] = useState<RecurrenceAttempt | null>(null);
  const [attemptedDefinition, setAttemptedDefinition] = useState<RecurrenceDefinition | null>(null);
  const [attemptedSchedule, setAttemptedSchedule] = useState<TaskScheduleValue | null>(null);
  const [attemptedExpectedVersion, setAttemptedExpectedVersion] = useState<number | null>(null);
  const [editingBaseVersion, setEditingBaseVersion] = useState<number | null>(null);
  const [restartConfirmationOpen, setRestartConfirmationOpen] = useState(false);
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false);
  const draftGuard = useTaskDraftGuard(
    task.id,
    "recurrence",
    dirty || (lastAttempt !== null && mutation.isError),
    mutation.isPending,
  );

  const recurrence = recurrenceQuery.data ?? null;
  const schedule = scheduleQuery.data ?? null;
  const preferences = preferencesQuery.data;
  const authoritativeTask =
    recovery.latestTask.version > task.version && "checklistItems" in recovery.latestTask
      ? recovery.latestTask
      : task;
  const recurrenceFence = useTaskRecurrenceVersionFence({
    paused: mutation.isPending || recovery.needsLatest,
    recurrenceVersion: recurrence?.taskVersion ?? null,
    refetchAll: refetchAuthoritativeState,
    taskVersion: authoritativeTask.version,
  });
  const timezone =
    recurrence?.timezone ?? (schedule?.kind === "timed" ? schedule.timezone : preferences?.timeZone);
  const interpretation =
    draft && schedule && timezone && preferences
      ? interpretTaskRecurrenceDraft(draft, schedule, timezone, preferences.hourCycle)
      : null;
  const summary =
    recurrence && schedule && preferences
      ? formatRecurrenceSummary(recurrence.definition, schedule, recurrence.timezone, preferences.hourCycle)
      : null;
  const recoveryReady =
    recovery.latestReady &&
    !recurrenceQuery.isFetching &&
    recurrenceQuery.isSuccess &&
    recurrenceQuery.data !== undefined &&
    !scheduleQuery.isFetching &&
    scheduleQuery.isSuccess &&
    scheduleQuery.data !== undefined;
  const latestMatchesAttempt = recurrenceAttemptMatches({
    attempt: lastAttempt,
    attemptedDefinition,
    attemptedSchedule,
    expectedVersion: attemptedExpectedVersion,
    recurrence,
    schedule,
  });
  const serverDidNotApply =
    recovery.unconfirmed &&
    recoveryReady &&
    attemptedExpectedVersion !== null &&
    recovery.latestTask.version === attemptedExpectedVersion &&
    !latestMatchesAttempt;
  const recovering = recovery.needsLatest;
  const controlsDisabled = disabled || mutation.isPending || recovering || recurrenceFence.versionMismatch;
  const canRetry =
    mutation.isError &&
    (recovery.outcome === "rejected" ||
      (recovery.conflict && recoveryReady) ||
      (recovery.unconfirmed && recoveryReady && (latestMatchesAttempt || serverDidNotApply)));

  function beginEditing() {
    if (controlsDisabled || !schedule || !timezone) return;
    setDraft(createTaskRecurrenceDraft(recurrence, schedule, timezone));
    setDirty(false);
    resetFeedback();
  }

  function changeDraft(next: TaskRecurrenceDraft) {
    setDraft(next);
    setDirty(true);
    setValidationError("");
    setSaveMessage("");
    if (!recovering) resetAttempt();
  }

  function requestSave() {
    const parsed = parseDraft();
    if (!parsed) return;
    if (recurrence === null) {
      void saveDefinition(parsed.definition);
      return;
    }
    setRestartConfirmationOpen(true);
  }

  async function confirmRestart() {
    const parsed = parseDraft();
    if (!parsed) return;
    setRestartConfirmationOpen(false);
    await saveDefinition(parsed.definition);
  }

  async function saveDefinition(
    definition: RecurrenceDefinition,
    expectedVersion?: number,
    recoveryRetry = false,
    authoritativeSchedule: TaskScheduleValue | null = schedule,
  ) {
    if ((controlsDisabled && !recoveryRetry) || authoritativeSchedule === null || !draftGuard.beginWrite()) {
      return;
    }
    const version =
      expectedVersion ?? editingBaseVersion ?? recurrence?.taskVersion ?? authoritativeTask.version;
    setLastAttempt("save");
    setAttemptedDefinition(definition);
    setAttemptedSchedule(snapshotTaskSchedule(authoritativeSchedule));
    setAttemptedExpectedVersion(version);
    setSaveMessage("");
    try {
      await mutation.mutateAsync({
        kind: "definition",
        task: authoritativeTask,
        expectedVersion: version,
        definition,
      });
      finishSuccessfulWrite(recurrence === null ? "Recurrence added" : "Future recurrence restarted");
    } catch {
      // Recoverable inline feedback owns validation, conflict, and unknown outcomes.
    } finally {
      draftGuard.finishWrite();
    }
  }

  async function confirmEnd(expectedVersion?: number, recoveryRetry = false) {
    if ((controlsDisabled && !recoveryRetry) || !draftGuard.beginWrite()) return;
    setEndConfirmationOpen(false);
    const version =
      expectedVersion ?? editingBaseVersion ?? recurrence?.taskVersion ?? authoritativeTask.version;
    setLastAttempt("end");
    setAttemptedDefinition(null);
    setAttemptedSchedule(null);
    setAttemptedExpectedVersion(version);
    setSaveMessage("");
    try {
      await mutation.mutateAsync({ kind: "end", task: authoritativeTask, expectedVersion: version });
      finishSuccessfulWrite("Recurrence ended");
    } catch {
      // The editor preserves its state until authoritative recurrence reload succeeds.
    } finally {
      draftGuard.finishWrite();
    }
  }

  async function retry() {
    if (!canRetry || !lastAttempt || attemptedExpectedVersion === null) return;
    if (!recovery.needsLatest) {
      if (lastAttempt === "end") {
        await confirmEnd(attemptedExpectedVersion, true);
        return;
      }
      const parsed = parseDraft(true);
      if (parsed) await saveDefinition(parsed.definition, attemptedExpectedVersion, true);
      return;
    }

    const [latestTask, latestRecurrence, latestSchedule] = await refetchAuthoritativeState();
    if (
      !latestTask.isSuccess ||
      !latestTask.data ||
      !latestRecurrence.isSuccess ||
      !latestSchedule.isSuccess ||
      latestSchedule.data === undefined
    ) {
      return;
    }
    const recurrenceAfterRefresh = latestRecurrence.data ?? null;
    const scheduleAfterRefresh = latestSchedule.data ?? null;
    const attemptApplied = recurrenceAttemptMatches({
      attempt: lastAttempt,
      attemptedDefinition,
      attemptedSchedule,
      expectedVersion: attemptedExpectedVersion,
      recurrence: recurrenceAfterRefresh,
      schedule: scheduleAfterRefresh,
    });
    if (attemptApplied) {
      acceptLatest(true);
      return;
    }
    if (recovery.unconfirmed && latestTask.data.version !== attemptedExpectedVersion) return;
    if (lastAttempt === "end") {
      await confirmEnd(latestTask.data.version, true);
      return;
    }
    const parsed = parseDraft(true, scheduleAfterRefresh, recurrenceAfterRefresh);
    if (parsed) {
      await saveDefinition(parsed.definition, latestTask.data.version, true, scheduleAfterRefresh);
    }
  }

  async function useLatest() {
    const [latestTask, latestRecurrence, latestSchedule] = await refetchAuthoritativeState();
    if (
      !latestTask.isSuccess ||
      !latestRecurrence.isSuccess ||
      !latestSchedule.isSuccess ||
      latestSchedule.data === undefined
    ) {
      return;
    }
    acceptLatest(
      recurrenceAttemptMatches({
        attempt: lastAttempt,
        attemptedDefinition,
        attemptedSchedule,
        expectedVersion: attemptedExpectedVersion,
        recurrence: latestRecurrence.data ?? null,
        schedule: latestSchedule.data ?? null,
      }),
    );
  }

  function keepEditing() {
    if (recovering && !recoveryReady) return;
    setEditingBaseVersion(recovery.latestTask.version);
    resetAttempt();
  }

  function cancelEditing() {
    setDraft(null);
    setDirty(false);
    setRestartConfirmationOpen(false);
    resetFeedback();
  }

  function parseDraft(
    recoveryRetry = false,
    authoritativeSchedule: TaskScheduleValue | null = schedule,
    authoritativeRecurrence: TaskRecurrenceDto | null = recurrence,
  ) {
    const authoritativeTimezone =
      authoritativeRecurrence?.timezone ??
      (authoritativeSchedule?.kind === "timed" ? authoritativeSchedule.timezone : preferences?.timeZone);
    if (
      !draft ||
      !authoritativeSchedule ||
      !authoritativeTimezone ||
      !preferences ||
      (controlsDisabled && !recoveryRetry)
    ) {
      return null;
    }
    const parsed = interpretTaskRecurrenceDraft(
      draft,
      authoritativeSchedule,
      authoritativeTimezone,
      preferences.hourCycle,
    );
    if (!parsed.valid) {
      setValidationError(parsed.message);
      return null;
    }
    return parsed;
  }

  function acceptLatest(applied: boolean) {
    setDraft(null);
    setDirty(false);
    setSaveMessage(applied ? (lastAttempt === "end" ? "Recurrence ended" : "Recurrence saved") : "");
    resetAttempt();
  }

  function finishSuccessfulWrite(message: string) {
    setDraft(null);
    setDirty(false);
    setSaveMessage(message);
    setEditingBaseVersion(null);
    setValidationError("");
    setLastAttempt(null);
    setAttemptedDefinition(null);
    setAttemptedSchedule(null);
    setAttemptedExpectedVersion(null);
  }

  function resetAttempt() {
    setLastAttempt(null);
    setAttemptedDefinition(null);
    setAttemptedSchedule(null);
    setAttemptedExpectedVersion(null);
    mutation.reset();
  }

  function resetFeedback() {
    setValidationError("");
    setSaveMessage("");
    setEditingBaseVersion(null);
    resetAttempt();
  }

  return {
    beginEditing,
    cancelEditing,
    canRetry,
    changeDraft,
    confirmEnd,
    confirmRestart,
    controlsDisabled,
    draft,
    endConfirmationOpen,
    interpretation,
    keepEditing,
    latestMatchesAttempt,
    mutation,
    preferences,
    preferencesQuery,
    recurrence,
    recurrenceQuery,
    recovery,
    recoveryReady,
    recurrenceVersionMismatch: recurrenceFence.versionMismatch,
    refreshLatest: recurrenceFence.refreshLatest,
    requestSave,
    retry,
    saveMessage,
    schedule,
    scheduleQuery,
    setEndConfirmationOpen,
    setRestartConfirmationOpen,
    restartConfirmationOpen,
    summary,
    task: authoritativeTask,
    timezone,
    useLatest,
    validationError,
  } as const;
}
