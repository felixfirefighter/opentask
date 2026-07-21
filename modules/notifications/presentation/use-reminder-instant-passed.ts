"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { TaskReminderSpec } from "../application/contracts";
import type { ReminderRecurrence, ReminderSchedule } from "./reminder-dormancy-policy";

const MAX_TIMER_MILLISECONDS = 2_147_483_647;
const MILLISECONDS_PER_MINUTE = 60_000;

export function useReminderInstantPassed({
  recurrence,
  schedule,
  spec,
}: Readonly<{
  recurrence: ReminderRecurrence | null;
  schedule: ReminderSchedule;
  spec: TaskReminderSpec | null;
}>) {
  const boundary = reminderInstantBoundary({ recurrence, schedule, spec });
  const subscribe = useCallback(
    (notify: () => void) => {
      if (boundary === null) return () => undefined;
      let timeout: number | undefined;
      const scheduleCheck = () => {
        const remaining = boundary - Date.now();
        if (remaining <= 0) {
          notify();
          return;
        }
        timeout = window.setTimeout(scheduleCheck, Math.min(remaining, MAX_TIMER_MILLISECONDS));
      };
      const checkWhenVisible = () => {
        if (document.visibilityState === "visible") notify();
      };

      scheduleCheck();
      window.addEventListener("focus", notify);
      document.addEventListener("visibilitychange", checkWhenVisible);
      return () => {
        if (timeout !== undefined) window.clearTimeout(timeout);
        window.removeEventListener("focus", notify);
        document.removeEventListener("visibilitychange", checkWhenVisible);
      };
    },
    [boundary],
  );
  const getSnapshot = useCallback(() => boundary !== null && Date.now() >= boundary, [boundary]);

  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}

export function reminderInstantBoundary({
  recurrence,
  schedule,
  spec,
}: Readonly<{
  recurrence: ReminderRecurrence | null;
  schedule: ReminderSchedule;
  spec: TaskReminderSpec | null;
}>): number | null {
  if (!spec) return null;
  if (spec.kind === "absolute") return finiteInstant(Date.parse(spec.remindAt));
  if (recurrence !== "none" || schedule?.kind !== "timed") return null;

  return finiteInstant(Date.parse(schedule.startAt) - spec.offsetMinutes * MILLISECONDS_PER_MINUTE);
}

function finiteInstant(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function serverSnapshot() {
  return false;
}
