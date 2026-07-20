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
  const [attemptedSchedule, setAttemptedSchedule] = useState<TaskScheduleValue | null | undefined>(undefined);
  const [reconciledAttempt, setReconciledAttempt] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const draftGuard = useTaskDraftGuard(
    task.id,
    "schedule",
    dirty || (lastAttempt !== null && mutation.isError),
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
  const recoveryReady = recovery.latestReady && !scheduleQuery.isFetching && !scheduleQuery.isError;
  const latestMatchesAttempt =
    recovery.unconfirmed &&
    recoveryReady &&
    attemptedSchedule !== undefined &&
    schedulesMatch(attemptedSchedule, schedule);
  const controlsDisabled = disabled || mutation.isPending || (recovery.needsLatest && !recoveryReady);

  function beginEditing(resetError = true) {
    if (!preferences) return;
    setDraft(createTaskScheduleDraft(schedule, preferences.timeZone));
    setDirty(false);
    setValidationError("");
    setSaveMessage("");
    setReconciledAttempt(false);
    if (resetError) {
      setLastAttempt(null);
      setAttemptedSchedule(undefined);
      mutation.reset();
    }
  }

  function changeDraft(next: TaskScheduleDraft) {
    setDraft(next);
    setDirty(true);
    setValidationError("");
    setSaveMessage("");
    setReconciledAttempt(false);
    if (!recovery.needsLatest) {
      setLastAttempt(null);
      setAttemptedSchedule(undefined);
      mutation.reset();
    }
  }

  async function saveSchedule(force = false) {
    if (!draft || !preferences || controlsDisabled || (recovery.needsLatest && (!force || !recoveryReady))) {
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
    if (controlsDisabled || (!schedule && !recovery.needsLatest)) return;
    if (recovery.needsLatest && (!force || !recoveryReady)) return;
    await runMutation(null, "clear", force);
  }

  async function runMutation(
    nextSchedule: TaskScheduleValue | null,
    attempt: "set" | "clear",
    force: boolean,
    expectedVersion?: number,
  ) {
    if (!draftGuard.beginWrite()) return;
    setLastAttempt(attempt);
    setAttemptedSchedule(nextSchedule);
    setSaveMessage("");
    setReconciledAttempt(false);
    try {
      await mutation.mutateAsync({
        task,
        expectedVersion:
          expectedVersion ?? (force && recovery.needsLatest ? recovery.latestTask.version : task.version),
        schedule: nextSchedule,
      });
      setDirty(false);
      setDraft(null);
      setLastAttempt(null);
      setAttemptedSchedule(undefined);
      setSaveMessage(attempt === "clear" ? "Schedule removed" : "Schedule saved");
    } catch {
      // Mutation state renders recoverable error controls while preserving the draft.
    } finally {
      draftGuard.finishWrite();
    }
  }

  async function useLatest() {
    const [latestTask, latestSchedule] = await Promise.all([
      recovery.refetchLatest(),
      scheduleQuery.refetch(),
    ]);
    if (!latestTask.isSuccess || !latestSchedule.isSuccess) return;
    acceptLatest(latestSchedule.data ?? null);
  }

  function acceptLatest(latestSchedule: TaskScheduleValue | null) {
    const latestApplied =
      recovery.unconfirmed &&
      attemptedSchedule !== undefined &&
      schedulesMatch(attemptedSchedule, latestSchedule);
    setDraft(null);
    setDirty(false);
    setValidationError("");
    setSaveMessage(latestApplied ? (lastAttempt === "clear" ? "Schedule removed" : "Schedule saved") : "");
    setReconciledAttempt(latestApplied);
    setLastAttempt(null);
    setAttemptedSchedule(undefined);
    mutation.reset();
  }

  async function retry() {
    if (!lastAttempt || !preferences) return;
    if (!recovery.needsLatest) {
      return lastAttempt === "clear" ? clearSchedule(true) : saveSchedule(true);
    }

    const [latestTask, latestSchedule] = await Promise.all([
      recovery.refetchLatest(),
      scheduleQuery.refetch(),
    ]);
    if (!latestTask.isSuccess || !latestTask.data || !latestSchedule.isSuccess) return;
    const savedSchedule = latestSchedule.data ?? null;
    if (
      recovery.unconfirmed &&
      attemptedSchedule !== undefined &&
      schedulesMatch(attemptedSchedule, savedSchedule)
    ) {
      acceptLatest(savedSchedule);
      return;
    }
    if (lastAttempt === "clear") {
      await runMutation(null, "clear", true, latestTask.data.version);
      return;
    }
    if (!draft) return;
    const parsed = interpretTaskScheduleDraft(draft, preferences.hourCycle);
    if (!parsed.valid) {
      setValidationError(parsed.message);
      return;
    }
    await runMutation(parsed.schedule, "set", true, latestTask.data.version);
  }

  function cancelEditing() {
    setDraft(null);
    setDirty(false);
    setValidationError("");
    setLastAttempt(null);
    setAttemptedSchedule(undefined);
    setReconciledAttempt(false);
    mutation.reset();
  }

  return {
    beginEditing,
    cancelEditing,
    changeDraft,
    clearSchedule,
    recoveryReady,
    controlsDisabled,
    draft,
    interpretation,
    lastAttempt,
    latestMatchesAttempt,
    mutation,
    preferences,
    preferencesQuery,
    recovery,
    reconciledAttempt,
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
    retry,
  } as const;
}

function schedulesMatch(left: TaskScheduleValue | null, right: TaskScheduleValue | null) {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "all_day" && right.kind === "all_day") {
    return left.startDate === right.startDate && left.endDate === right.endDate;
  }
  if (left.kind === "timed" && right.kind === "timed") {
    return left.startAt === right.startAt && left.endAt === right.endAt && left.timezone === right.timezone;
  }
  return false;
}
