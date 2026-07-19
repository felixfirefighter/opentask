"use client";

import { useState } from "react";

import type { TaskDetailDto, TaskScheduleValue } from "../application/contracts";
import {
  useSchedulePreferencesQuery,
  useTaskScheduleMutation,
  useTaskScheduleQuery,
} from "./data/use-task-schedule";
import {
  createTaskScheduleDraft,
  formatTaskSchedule,
  interpretTaskScheduleDraft,
  type TaskScheduleDraft,
} from "./task-schedule-form-policy";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";

export function useTaskScheduleEditorController(task: TaskDetailDto, disabled: boolean) {
  const scheduleQuery = useTaskScheduleQuery(task.id);
  const preferencesQuery = useSchedulePreferencesQuery();
  const mutation = useTaskScheduleMutation();
  const recovery = useTaskConflictRecovery(task, mutation.error);
  const [draft, setDraft] = useState<TaskScheduleDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [lastAttempt, setLastAttempt] = useState<"set" | "clear" | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const draftGuard = useTaskDraftGuard(
    task.id,
    "schedule",
    dirty || (draft !== null && mutation.isError),
    mutation.isPending,
  );

  const preferences = preferencesQuery.data;
  const schedule = scheduleQuery.data ?? null;
  const summary =
    preferences && schedule
      ? formatTaskSchedule(schedule, preferences.timeZone, preferences.hourCycle)
      : "No schedule";
  const interpretation =
    draft && preferences ? interpretTaskScheduleDraft(draft, preferences.hourCycle) : null;
  const conflictReady = recovery.latestReady && !scheduleQuery.isFetching && !scheduleQuery.isError;
  const controlsDisabled = disabled || mutation.isPending;

  function beginEditing(resetError = true) {
    if (!preferences) return;
    setDraft(createTaskScheduleDraft(schedule, preferences.timeZone));
    setDirty(false);
    setValidationError("");
    setSaveMessage("");
    if (resetError) {
      setLastAttempt(null);
      mutation.reset();
    }
  }

  function changeDraft(next: TaskScheduleDraft) {
    setDraft(next);
    setDirty(true);
    setValidationError("");
    setSaveMessage("");
    if (!recovery.conflict) mutation.reset();
  }

  async function saveSchedule(force = false) {
    if (!draft || !preferences || controlsDisabled || (recovery.conflict && (!force || !conflictReady))) {
      return;
    }
    const parsed = interpretTaskScheduleDraft(draft, preferences.hourCycle);
    if (!parsed.valid) {
      setValidationError(parsed.message);
      return;
    }
    await runMutation(parsed.schedule, "set", force);
  }

  async function clearSchedule(force = false) {
    if (controlsDisabled || (!schedule && !recovery.conflict)) return;
    if (recovery.conflict && (!force || !conflictReady)) return;
    await runMutation(null, "clear", force);
  }

  async function runMutation(
    nextSchedule: TaskScheduleValue | null,
    attempt: "set" | "clear",
    force: boolean,
  ) {
    if (!draftGuard.beginWrite()) return;
    setLastAttempt(attempt);
    setSaveMessage("");
    try {
      await mutation.mutateAsync({
        task,
        expectedVersion: force && recovery.conflict ? recovery.latestTask.version : task.version,
        schedule: nextSchedule,
      });
      setDirty(false);
      setDraft(null);
      setLastAttempt(null);
      setSaveMessage(attempt === "clear" ? "Schedule removed" : "Schedule saved");
    } catch {
      // Mutation state renders recoverable error controls while preserving the draft.
    } finally {
      draftGuard.finishWrite();
    }
  }

  async function useLatest() {
    const [, latestSchedule] = await Promise.all([recovery.refetchLatest(), scheduleQuery.refetch()]);
    if (!latestSchedule.isSuccess) return;
    setDraft(null);
    setDirty(false);
    setValidationError("");
    setLastAttempt(null);
    mutation.reset();
  }

  function cancelEditing() {
    setDraft(null);
    setDirty(false);
    setValidationError("");
    mutation.reset();
  }

  return {
    beginEditing,
    cancelEditing,
    changeDraft,
    clearSchedule,
    conflictReady,
    controlsDisabled,
    draft,
    interpretation,
    lastAttempt,
    mutation,
    preferences,
    preferencesQuery,
    recovery,
    saveMessage,
    saveSchedule,
    schedule,
    scheduleQuery,
    summary,
    task,
    useLatest,
    validationError,
    keepEditing() {
      if (!draft) beginEditing(false);
    },
    refreshLatest() {
      void recovery.refetchLatest();
      void scheduleQuery.refetch();
    },
    retry() {
      return lastAttempt === "clear" ? clearSchedule(true) : saveSchedule(true);
    },
  } as const;
}
