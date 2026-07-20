"use client";

import { useState } from "react";

import type { TaskDetailDto } from "../application/contracts";
import type { RecurrenceDefinition, TaskRecurrenceDto } from "../application/contracts/recurrence-contract";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";
import {
  createTaskRecurrenceDraft,
  formatRecurrenceSummary,
  interpretTaskRecurrenceDraft,
  type TaskRecurrenceDraft,
} from "./task-recurrence-form-policy";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useSchedulePreferencesQuery, useTaskScheduleQuery } from "./data/use-task-schedule";
import { useTaskRecurrenceMutation, useTaskRecurrenceQuery } from "./data/use-task-recurrence";

type RecurrenceAttempt = "save" | "end";

export function useTaskRecurrenceEditorController(task: TaskDetailDto, disabled: boolean) {
  const recurrenceQuery = useTaskRecurrenceQuery(task.id, task.parentTaskId === null);
  const scheduleQuery = useTaskScheduleQuery(task.id);
  const preferencesQuery = useSchedulePreferencesQuery();
  const mutation = useTaskRecurrenceMutation();
  const recovery = useTaskConflictRecovery(task, mutation.error);
  const [draft, setDraft] = useState<TaskRecurrenceDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [lastAttempt, setLastAttempt] = useState<RecurrenceAttempt | null>(null);
  const [attemptedDefinition, setAttemptedDefinition] = useState<RecurrenceDefinition | null>(null);
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
    recurrenceQuery.data !== undefined;
  const latestMatchesAttempt = attemptMatchesRecurrence(
    lastAttempt,
    attemptedDefinition,
    attemptedExpectedVersion,
    recurrence,
  );
  const serverDidNotApply =
    recovery.unconfirmed &&
    recoveryReady &&
    attemptedExpectedVersion !== null &&
    recovery.latestTask.version === attemptedExpectedVersion &&
    !latestMatchesAttempt;
  const recovering = recovery.needsLatest;
  const controlsDisabled = disabled || mutation.isPending || recovering;
  const canRetry =
    mutation.isError &&
    (recovery.outcome === "rejected" ||
      (recovery.conflict && recoveryReady) ||
      (recovery.unconfirmed && recoveryReady && (latestMatchesAttempt || serverDidNotApply)));

  function beginEditing() {
    if (!schedule || !timezone) return;
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
  ) {
    if ((controlsDisabled && !recoveryRetry) || !draftGuard.beginWrite()) return;
    const version = expectedVersion ?? editingBaseVersion ?? recurrence?.taskVersion ?? task.version;
    setLastAttempt("save");
    setAttemptedDefinition(definition);
    setAttemptedExpectedVersion(version);
    setSaveMessage("");
    try {
      await mutation.mutateAsync({
        kind: "definition",
        task,
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
    const version = expectedVersion ?? editingBaseVersion ?? recurrence?.taskVersion ?? task.version;
    setLastAttempt("end");
    setAttemptedDefinition(null);
    setAttemptedExpectedVersion(version);
    setSaveMessage("");
    try {
      await mutation.mutateAsync({ kind: "end", task, expectedVersion: version });
      finishSuccessfulWrite("Recurrence ended");
    } catch {
      // The editor preserves its state until authoritative recurrence reload succeeds.
    } finally {
      draftGuard.finishWrite();
    }
  }

  async function retry() {
    if (!canRetry || !lastAttempt || attemptedExpectedVersion === null) return;
    if (latestMatchesAttempt) {
      acceptLatest(true);
      return;
    }
    const version = recovery.conflict ? recovery.latestTask.version : attemptedExpectedVersion;
    if (lastAttempt === "end") {
      await confirmEnd(version, true);
      return;
    }
    const parsed = parseDraft(true);
    if (parsed) await saveDefinition(parsed.definition, version, true);
  }

  async function useLatest() {
    const [latestTask, latestRecurrence] = await Promise.all([
      recovery.refetchLatest(),
      recurrenceQuery.refetch(),
    ]);
    if (!latestTask.isSuccess || !latestRecurrence.isSuccess) return;
    acceptLatest(
      attemptMatchesRecurrence(
        lastAttempt,
        attemptedDefinition,
        attemptedExpectedVersion,
        latestRecurrence.data ?? null,
      ),
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

  function parseDraft(recoveryRetry = false) {
    if (!draft || !schedule || !timezone || !preferences || (controlsDisabled && !recoveryRetry)) {
      return null;
    }
    const parsed = interpretTaskRecurrenceDraft(draft, schedule, timezone, preferences.hourCycle);
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
    setAttemptedExpectedVersion(null);
  }

  function resetAttempt() {
    setLastAttempt(null);
    setAttemptedDefinition(null);
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
    requestSave,
    retry,
    saveMessage,
    schedule,
    scheduleQuery,
    setEndConfirmationOpen,
    setRestartConfirmationOpen,
    restartConfirmationOpen,
    summary,
    task,
    timezone,
    useLatest,
    validationError,
  } as const;
}

function attemptMatchesRecurrence(
  attempt: RecurrenceAttempt | null,
  definition: RecurrenceDefinition | null,
  expectedVersion: number | null,
  recurrence: TaskRecurrenceDto | null,
): boolean {
  if (!attempt || expectedVersion === null || !recurrence || recurrence.taskVersion < expectedVersion + 1) {
    return false;
  }
  if (attempt === "end") return recurrence.lifecycle === "ended";
  return definition !== null && definitionsMatch(definition, recurrence.definition);
}

function definitionsMatch(left: RecurrenceDefinition, right: RecurrenceDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
