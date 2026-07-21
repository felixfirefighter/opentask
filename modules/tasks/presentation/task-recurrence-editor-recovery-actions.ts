import type { TaskDetailDto, TaskScheduleValue } from "../application/contracts";
import type { RecurrenceDefinition, TaskRecurrenceDto } from "../application/contracts/recurrence-contract";
import type { TaskRecurrenceReminderResolution } from "../application/contracts/task-reminder-contract";
import { recurrenceAttemptMatches } from "./task-recurrence-recovery-policy";

type RecurrenceAttempt = Readonly<{
  definition: RecurrenceDefinition | null;
  expectedVersion: number | null;
  kind: "save" | "end" | null;
  schedule: TaskScheduleValue | null;
}>;

type RefreshResult<T> = Readonly<{ data: T | undefined; isSuccess: boolean }>;

export function createTaskRecurrenceRecoveryActions({
  acceptLatest,
  attempt,
  canRetry,
  confirmEnd,
  currentSchedule,
  parseDraft,
  recovery,
  refetchAuthoritativeState,
  reminderResolutionForRetry,
  saveDefinition,
}: Readonly<{
  acceptLatest: (applied: boolean) => void;
  attempt: RecurrenceAttempt;
  canRetry: boolean;
  confirmEnd: (expectedVersion: number, recoveryRetry: true) => Promise<void>;
  currentSchedule: TaskScheduleValue | null;
  parseDraft: (
    recoveryRetry: true,
    schedule?: TaskScheduleValue | null,
    recurrence?: TaskRecurrenceDto | null,
  ) => Readonly<{ definition: RecurrenceDefinition }> | null;
  recovery: Readonly<{ needsLatest: boolean; unconfirmed: boolean }>;
  refetchAuthoritativeState: () => Promise<
    readonly [
      RefreshResult<TaskDetailDto>,
      RefreshResult<TaskRecurrenceDto | null>,
      RefreshResult<TaskScheduleValue | null>,
      unknown,
    ]
  >;
  reminderResolutionForRetry: () => TaskRecurrenceReminderResolution | null | undefined;
  saveDefinition: (
    definition: RecurrenceDefinition,
    expectedVersion: number,
    recoveryRetry: true,
    schedule: TaskScheduleValue | null,
    reminderResolution: TaskRecurrenceReminderResolution | null,
  ) => Promise<void>;
}>) {
  async function retry() {
    if (!canRetry || !attempt.kind || attempt.expectedVersion === null) return;
    if (!recovery.needsLatest) {
      if (attempt.kind === "end") {
        await confirmEnd(attempt.expectedVersion, true);
        return;
      }
      const parsed = parseDraft(true);
      const reminderResolution = reminderResolutionForRetry();
      if (parsed && reminderResolution !== undefined) {
        await saveDefinition(
          parsed.definition,
          attempt.expectedVersion,
          true,
          currentSchedule,
          reminderResolution,
        );
      }
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
    if (attemptMatches(attempt, recurrenceAfterRefresh, scheduleAfterRefresh)) {
      acceptLatest(true);
      return;
    }
    if (recovery.unconfirmed && latestTask.data.version !== attempt.expectedVersion) return;
    if (attempt.kind === "end") {
      await confirmEnd(latestTask.data.version, true);
      return;
    }
    const parsed = parseDraft(true, scheduleAfterRefresh, recurrenceAfterRefresh);
    const reminderResolution = reminderResolutionForRetry();
    if (parsed && reminderResolution !== undefined) {
      await saveDefinition(
        parsed.definition,
        latestTask.data.version,
        true,
        scheduleAfterRefresh,
        reminderResolution,
      );
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
    acceptLatest(attemptMatches(attempt, latestRecurrence.data ?? null, latestSchedule.data ?? null));
  }

  return { retry, useLatest } as const;
}

function attemptMatches(
  attempt: RecurrenceAttempt,
  recurrence: TaskRecurrenceDto | null,
  schedule: TaskScheduleValue | null,
): boolean {
  return recurrenceAttemptMatches({
    attempt: attempt.kind,
    attemptedDefinition: attempt.definition,
    attemptedSchedule: attempt.schedule,
    expectedVersion: attempt.expectedVersion,
    recurrence,
    schedule,
  });
}
