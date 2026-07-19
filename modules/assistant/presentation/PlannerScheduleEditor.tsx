"use client";

import { useId } from "react";

import type { PlannerSchedule } from "../application/contracts";

import {
  defaultAllDaySchedule,
  defaultTimedSchedule,
  localValueToInstant,
  scheduleToLocalValue,
} from "./planner-schedule-edit";
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
  const mode = schedule?.kind ?? "none";

  function changeMode(next: string) {
    if (next === "none" && allowNone) onChange(null);
    else if (next === "all_day") onChange(defaultAllDaySchedule(context.planningDate));
    else if (next === "timed") {
      onChange(
        defaultTimedSchedule({
          planningDate: context.planningDate,
          timeZone: context.timeZone,
          workWindowStart: context.workWindowStart,
          durationMinutes: context.defaultDurationMinutes,
        }),
      );
    }
  }

  return (
    <fieldset className={styles.scheduleEditor}>
      <legend>Schedule after apply</legend>
      <label>
        <span>Schedule type</span>
        <select value={mode} disabled={disabled} onChange={(event) => changeMode(event.currentTarget.value)}>
          {allowNone ? <option value="none">Not scheduled</option> : null}
          <option value="timed">Timed</option>
          <option value="all_day">All day</option>
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
              onChange={(event) => {
                const startAt = localValueToInstant(event.currentTarget.value, schedule.timeZone);
                if (startAt) onChange({ ...schedule, startAt });
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
              onChange={(event) => {
                const endAt = localValueToInstant(event.currentTarget.value, schedule.timeZone);
                if (endAt) onChange({ ...schedule, endAt });
              }}
            />
          </label>
          <p>Times use {schedule.timeZone}. The server rechecks the work window and overlaps.</p>
        </div>
      ) : null}
      {schedule?.kind === "all_day" ? (
        <div className={styles.scheduleGrid}>
          <label htmlFor={`${id}-start-date`}>
            <span>Starts on</span>
            <input
              id={`${id}-start-date`}
              type="date"
              value={schedule.startDate}
              disabled={disabled}
              onChange={(event) => onChange({ ...schedule, startDate: event.currentTarget.value })}
            />
          </label>
          <label htmlFor={`${id}-end-date`}>
            <span>Ends before</span>
            <input
              id={`${id}-end-date`}
              type="date"
              value={schedule.endDate}
              disabled={disabled}
              onChange={(event) => onChange({ ...schedule, endDate: event.currentTarget.value })}
            />
          </label>
          <p>The end date is exclusive, so a one-day task ends before the following date.</p>
        </div>
      ) : null}
    </fieldset>
  );
}
