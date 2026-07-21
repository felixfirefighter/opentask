"use client";

import { useCallback, useState } from "react";

import type { TaskDetailDto, TaskScheduleValue } from "../application/contracts";
import type { RecurrenceDefinition, TaskRecurrenceDto } from "../application/contracts/recurrence-contract";
import type { TaskRecurrenceReminderResolution } from "../application/contracts/task-reminder-contract";
import { isTaskApiError } from "./data/task-api-request";
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
import { createTaskRecurrenceRecoveryActions } from "./task-recurrence-editor-recovery-actions";
import type { TaskRecurrenceReminderReview } from "./task-recurrence-reminder-review";
import { useTaskRecurrenceReminderResolution } from "./use-task-recurrence-reminder-resolution";

type RecurrenceAttempt = "save" | "end";

export function useTaskRecurrenceEditorController(
  task: TaskDetailDto,
  disabled: boolean,
  reminderReview: TaskRecurrenceReminderReview,
) {
  const recurrenceQuery = useTaskRecurrenceQuery(task.id, task.parentTaskId === null);
  const scheduleQuery = useTaskScheduleQuery(task.id);
  const preferencesQuery = useSchedulePreferencesQuery();
  const mutation = useTaskRecurrenceMutation();
  const recovery = useTaskConflictRecovery(task, mutation.error);
  const refetchLatestTask = recovery.refetchLatest;
  const refetchRecurrence = recurrenceQuery.refetch;
  const refetchSchedule = scheduleQuery.refetch;
  const refreshReminderReview = reminderReview.refresh;
  const refetchAuthoritativeState = useCallback(
    () => Promise.all([refetchLatestTask(), refetchRecurrence(), refetchSchedule(), refreshReminderReview()]),
    [refetchLatestTask, refetchRecurrence, refetchSchedule, refreshReminderReview],
  );
  const [draft, setDraft] = useState<TaskRecurrenceDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [lastAttempt, setLastAttempt] = useState<RecurrenceAttempt | null>(null);
  const [attemptedDefinition, setAttemptedDefinition] = useState<RecurrenceDefinition | null>(null);
  const [attemptedSchedule, setAttemptedSchedule] = useState<TaskScheduleValue | null>(null);
  const [attemptedExpectedVersion, setAttemptedExpectedVersion] = useState<number | null>(null);
  const [attemptedReminderResolution, setAttemptedReminderResolution] =
    useState<TaskRecurrenceReminderResolution | null>(null);
  const [editingBaseVersion, setEditingBaseVersion] = useState<number | null>(null);
  const [restartConfirmationOpen, setRestartConfirmationOpen] = useState(false);
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false);
  const reminderResolution = useTaskRecurrenceReminderResolution(reminderReview);
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
  const reminderResolutionConflict =
    attemptedReminderResolution !== null &&
    isTaskApiError(mutation.error) &&
    mutation.error.code === "CONFLICT";
  const taskRecoveryReady = reminderResolutionConflict ? recovery.latestQueryReady : recovery.latestReady;
  const recoveryReady =
    taskRecoveryReady &&
    !recurrenceQuery.isFetching &&
    recurrenceQuery.isSuccess &&
    recurrenceQuery.data !== undefined &&
    !scheduleQuery.isFetching &&
    scheduleQuery.isSuccess &&
    scheduleQuery.data !== undefined &&
    (attemptedReminderResolution === null || reminderReview.status === "ready");
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
  const controlsDisabled =
    disabled ||
    mutation.isPending ||
    recovering ||
    recurrenceFence.versionMismatch ||
    reminderReview.status !== "ready";
  const canRetry =
    mutation.isError &&
    (recovery.outcome === "rejected" ||
      (recovery.conflict && recoveryReady) ||
      (recovery.unconfirmed && recoveryReady && (latestMatchesAttempt || serverDidNotApply))) &&
    (attemptedReminderResolution === null || reminderReview.status === "ready");
  const { retry, useLatest } = createTaskRecurrenceRecoveryActions({
    acceptLatest,
    attempt: {
      definition: attemptedDefinition,
      expectedVersion: attemptedExpectedVersion,
      kind: lastAttempt,
      schedule: attemptedSchedule,
    },
    canRetry,
    confirmEnd,
    currentSchedule: schedule,
    parseDraft,
    recovery,
    refetchAuthoritativeState,
    reminderResolutionForRetry: () => reminderResolution.forRetry(attemptedReminderResolution),
    saveDefinition,
  });

  function beginEditing() {
    if (controlsDisabled || !schedule || !timezone) return;
    setDraft(createTaskRecurrenceDraft(recurrence, schedule, timezone));
    setDirty(false);
    reminderResolution.resetDraft();
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
      reviewReminderBeforeSave(parsed.definition);
      return;
    }
    setRestartConfirmationOpen(true);
  }

  async function confirmRestart() {
    const parsed = parseDraft();
    if (!parsed) return;
    setRestartConfirmationOpen(false);
    reviewReminderBeforeSave(parsed.definition);
  }

  function reviewReminderBeforeSave(definition: RecurrenceDefinition) {
    if (reminderResolution.prepareForSave() === "ready") {
      void saveDefinition(definition, undefined, false, schedule, null);
    }
  }

  async function confirmReminderResolution() {
    const parsed = parseDraft();
    if (!parsed || reminderReview.status !== "ready") return;
    const resolution = reminderResolution.parseChoice();
    if (!resolution) return;
    reminderResolution.close();
    await saveDefinition(parsed.definition, undefined, false, schedule, resolution);
  }

  async function saveDefinition(
    definition: RecurrenceDefinition,
    expectedVersion?: number,
    recoveryRetry = false,
    authoritativeSchedule: TaskScheduleValue | null = schedule,
    reminderResolution: TaskRecurrenceReminderResolution | null = null,
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
    setAttemptedReminderResolution(reminderResolution);
    setSaveMessage("");
    try {
      await mutation.mutateAsync({
        kind: "definition",
        task: authoritativeTask,
        expectedVersion: version,
        definition,
        reminderResolution,
      });
      if (reminderResolution !== null) void refreshReminderReview();
      finishSuccessfulWrite(recurrence === null ? "Recurrence added" : "Future recurrence restarted");
    } catch {
      // Recoverable inline feedback owns validation, conflict, and unknown outcomes.
      if (reminderResolution !== null) void refreshReminderReview();
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
    setAttemptedReminderResolution(null);
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

  function keepEditing() {
    if (recovering && !recoveryReady) return;
    setEditingBaseVersion(recovery.latestTask.version);
    resetAttempt();
  }

  function cancelEditing() {
    setDraft(null);
    setDirty(false);
    setRestartConfirmationOpen(false);
    reminderResolution.close();
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
    setAttemptedReminderResolution(null);
  }

  function resetAttempt() {
    setLastAttempt(null);
    setAttemptedDefinition(null);
    setAttemptedSchedule(null);
    setAttemptedExpectedVersion(null);
    setAttemptedReminderResolution(null);
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
    changeReminderChoice: reminderResolution.changeChoice,
    changeReminderOffsetMinutes: reminderResolution.changeOffsetMinutes,
    changeReminderResolutionOpen: reminderResolution.changeOpen,
    changeDraft,
    confirmEnd,
    confirmReminderResolution,
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
    reminderResolutionInAttempt: attemptedReminderResolution !== null,
    reminderChoice: reminderResolution.choice,
    reminderOffsetMinutes: reminderResolution.offsetMinutes,
    reminderResolutionError: reminderResolution.error,
    reminderResolutionOpen: reminderResolution.open,
    reminderReview,
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
