"use client";

import type { TaskScheduleDraft } from "./task-schedule-form-policy";
import styles from "./TaskScheduleEditor.module.css";

const timeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

export function TaskScheduleFields({
  disabled,
  draft,
  kindLockReason,
  onChange,
  taskId,
}: Readonly<{
  disabled: boolean;
  draft: TaskScheduleDraft;
  kindLockReason?: string | undefined;
  onChange: (draft: TaskScheduleDraft) => void;
  taskId: string;
}>) {
  const helpId = `schedule-timezone-help-${taskId}`;
  const kindLockHelpId = `schedule-kind-lock-help-${taskId}`;
  return (
    <div className={styles.fields}>
      <fieldset
        className={styles.kindFieldset}
        aria-describedby={kindLockReason ? kindLockHelpId : undefined}
      >
        <legend>Schedule type</legend>
        <label>
          <input
            type="radio"
            name={`schedule-kind-${taskId}`}
            checked={draft.kind === "all_day"}
            disabled={disabled || kindLockReason !== undefined}
            onChange={() => onChange({ ...draft, kind: "all_day" })}
          />
          All day
        </label>
        <label>
          <input
            type="radio"
            name={`schedule-kind-${taskId}`}
            checked={draft.kind === "timed"}
            disabled={disabled || kindLockReason !== undefined}
            onChange={() => onChange({ ...draft, kind: "timed" })}
          />
          Specific time
        </label>
      </fieldset>
      {kindLockReason ? (
        <p id={kindLockHelpId} className={styles.seriesNote}>
          {kindLockReason}
        </p>
      ) : null}

      {draft.kind === "all_day" ? (
        <div className={styles.fieldGrid}>
          <ScheduleField
            id={`schedule-start-date-${taskId}`}
            label="Start date"
            type="date"
            value={draft.startDate}
            disabled={disabled}
            onChange={(startDate) => onChange({ ...draft, startDate })}
          />
          <ScheduleField
            id={`schedule-end-date-${taskId}`}
            label="End date (exclusive)"
            type="date"
            value={draft.endDate}
            disabled={disabled}
            onChange={(endDate) => onChange({ ...draft, endDate })}
          />
        </div>
      ) : (
        <div className={styles.fieldGrid}>
          <ScheduleField
            id={`schedule-start-time-${taskId}`}
            label="Start"
            type="datetime-local"
            value={draft.startLocal}
            disabled={disabled}
            onChange={(startLocal) => onChange({ ...draft, startLocal })}
          />
          <ScheduleField
            id={`schedule-end-time-${taskId}`}
            label="End"
            type="datetime-local"
            value={draft.endLocal}
            disabled={disabled}
            onChange={(endLocal) => onChange({ ...draft, endLocal })}
          />
        </div>
      )}

      <label className={styles.timeZoneField} htmlFor={`schedule-timezone-${taskId}`}>
        <span>Timezone</span>
        <input
          id={`schedule-timezone-${taskId}`}
          list={`schedule-timezones-${taskId}`}
          value={draft.timeZone}
          disabled={disabled || draft.kind === "all_day"}
          aria-describedby={helpId}
          onChange={(event) => onChange({ ...draft, timeZone: event.currentTarget.value })}
        />
        <datalist id={`schedule-timezones-${taskId}`}>
          {timeZones.map((timeZone) => (
            <option key={timeZone} value={timeZone} />
          ))}
        </datalist>
        <small id={helpId}>
          {draft.kind === "all_day"
            ? "All-day boundaries use your saved timezone."
            : "Times are saved as exact instants with this IANA timezone."}
        </small>
      </label>
    </div>
  );
}

function ScheduleField({
  disabled,
  id,
  label,
  onChange,
  type,
  value,
}: Readonly<{
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  type: "date" | "datetime-local";
  value: string;
}>) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        required
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
