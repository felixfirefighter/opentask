"use client";

import { useId, useState } from "react";

import type { PlannerSchedule } from "../application/contracts";

import { defaultTimedSchedule, localValueToInstant, scheduleToLocalValue } from "./planner-schedule-edit";
import styles from "./PlannerProposalCard.module.css";

type ScheduleContext = Readonly<{
  planningDate: string;
  timeZone: string;
  workWindowStart: string;
  defaultDurationMinutes: number;
}>;

export function PlannerScheduleEditor({
  schedule,
  context,
  allowNone,
  disabled,
  onChange,
}: Readonly<{
  schedule: PlannerSchedule | null;
  context: ScheduleContext;
  allowNone: boolean;
  disabled: boolean;
  onChange: (schedule: PlannerSchedule | null) => void;
}>) {
  const id = useId();
  const [editError, setEditError] = useState<ScheduleEditError | null>(null);
  const unsupportedAllDay = schedule?.kind === "all_day";
  const missingRequiredSchedule = schedule === null && !allowNone;
  const unsupportedSchedule = unsupportedAllDay || missingRequiredSchedule;
  const mode = unsupportedSchedule ? "unsupported" : (schedule?.kind ?? "none");
  const helpId = `${id}-schedule-help`;
  const errorId = `${id}-schedule-error`;
  const unsupportedMessage = unsupportedAllDay
    ? allowNone
      ? "All-day schedules cannot be applied from AI review. Choose Timed, or leave this new task unscheduled."
      : "All-day schedules cannot be applied from AI review. Choose Timed before applying this change."
    : missingRequiredSchedule
      ? "This proposal needs a timed schedule before it can be applied."
      : null;
  const activeError = editError?.message ?? unsupportedMessage;

  function changeMode(next: string) {
    setEditError(null);
    if (next === "none" && allowNone) {
      onChange(null);
      return;
    }
    if (next === "timed") {
      const nextSchedule = defaultTimedSchedule({
        planningDate: context.planningDate,
        timeZone: context.timeZone,
        workWindowStart: context.workWindowStart,
        durationMinutes: context.defaultDurationMinutes,
      });
      if (nextSchedule) {
        onChange(nextSchedule);
      } else {
        setEditError({
          field: "mode",
          message: `The default start time does not occur once in ${context.timeZone}. Return to Describe and choose another planning date or work-window start, then try again.`,
        });
      }
    }
  }

  function changeTimedBoundary(field: "start" | "end", value: string, timed: TimedSchedule) {
    const instant = localValueToInstant(value, timed.timeZone);
    if (!instant) {
      setEditError({
        field,
        message: `The attempted ${field} time was not used. Choose a local time that occurs once in ${timed.timeZone}; daylight-saving changes can skip or repeat times.`,
      });
      return;
    }
    setEditError(null);
    onChange(field === "start" ? { ...timed, startAt: instant } : { ...timed, endAt: instant });
  }

  return (
    <fieldset className={styles.scheduleEditor}>
      <legend>Schedule after apply</legend>
      <label>
        <span>Schedule type</span>
        <select
          value={mode}
          disabled={disabled}
          aria-describedby={`${helpId}${activeError ? ` ${errorId}` : ""}`}
          onChange={(event) => changeMode(event.currentTarget.value)}
        >
          {unsupportedSchedule ? (
            <option value="unsupported" disabled>
              Choose a timed schedule
            </option>
          ) : null}
          {allowNone ? <option value="none">Not scheduled</option> : null}
          <option value="timed">Timed</option>
        </select>
      </label>
      {schedule?.kind === "timed" ? (
        <div className={styles.scheduleGrid}>
          <label htmlFor={`${id}-start`}>
            <span>Starts</span>
            <input
              id={`${id}-start`}
              type="datetime-local"
              value={scheduleToLocalValue(schedule.startAt, schedule.timeZone)}
              disabled={disabled}
              aria-describedby={`${helpId}${editError?.field === "start" ? ` ${errorId}` : ""}`}
              onChange={(event) => {
                changeTimedBoundary("start", event.currentTarget.value, schedule);
              }}
            />
          </label>
          <label htmlFor={`${id}-end`}>
            <span>Ends</span>
            <input
              id={`${id}-end`}
              type="datetime-local"
              value={scheduleToLocalValue(schedule.endAt, schedule.timeZone)}
              disabled={disabled}
              aria-describedby={`${helpId}${editError?.field === "end" ? ` ${errorId}` : ""}`}
              onChange={(event) => {
                changeTimedBoundary("end", event.currentTarget.value, schedule);
              }}
            />
          </label>
          <p id={helpId}>
            AI review schedules use timed work blocks. Times use {schedule.timeZone}; the server rechecks the
            work window and overlaps.
          </p>
        </div>
      ) : (
        <div className={styles.scheduleGrid}>
          <p id={helpId}>
            AI review schedules use timed work blocks. All-day scheduling remains available in the manual task
            editor.
          </p>
        </div>
      )}
      {activeError ? (
        <div className={styles.notice} data-tone="danger" id={errorId} role="alert">
          <div>
            <strong>Schedule not changed</strong>
            <p>{activeError}</p>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}

type TimedSchedule = Extract<PlannerSchedule, { kind: "timed" }>;

type ScheduleEditError = Readonly<{
  field: "mode" | "start" | "end";
  message: string;
}>;
