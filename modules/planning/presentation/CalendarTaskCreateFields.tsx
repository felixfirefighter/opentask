import type { PlanningListOption } from "./planning-client-api";
import type { PlanningPriority } from "./planning-screen-model";
import type { ScheduleFormValues } from "./schedule-form-policy";
import styles from "./ScheduleEditorDialog.module.css";

export type CalendarTaskDraft = Readonly<{
  title: string;
  descriptionMd: string;
  priority: PlanningPriority;
  listId: string;
}>;

export function CalendarTaskCreateFields({
  draft,
  fieldsLocked,
  inbox,
  listError,
  listHasNextPage,
  listLoading,
  onLoadMoreLists,
  onRetryLists,
  onScheduleChange,
  onTaskChange,
  regularLists,
  schedule,
  timeZone,
}: Readonly<{
  draft: CalendarTaskDraft;
  fieldsLocked: boolean;
  inbox: PlanningListOption;
  listError: boolean;
  listHasNextPage: boolean;
  listLoading: boolean;
  onLoadMoreLists: () => void;
  onRetryLists: () => void;
  onScheduleChange: <K extends keyof ScheduleFormValues>(key: K, value: ScheduleFormValues[K]) => void;
  onTaskChange: <K extends keyof CalendarTaskDraft>(key: K, value: CalendarTaskDraft[K]) => void;
  regularLists: readonly PlanningListOption[];
  schedule: ScheduleFormValues;
  timeZone: string;
}>) {
  return (
    <>
      <label className={styles.fullField}>
        <span>Task title</span>
        <input
          autoFocus
          value={draft.title}
          maxLength={500}
          disabled={fieldsLocked}
          required
          onChange={(event) => onTaskChange("title", event.currentTarget.value)}
        />
      </label>
      <label className={styles.fullField}>
        <span>Notes (Markdown)</span>
        <textarea
          value={draft.descriptionMd}
          maxLength={20_000}
          disabled={fieldsLocked}
          rows={4}
          onChange={(event) => onTaskChange("descriptionMd", event.currentTarget.value)}
        />
      </label>
      <div className={styles.fields}>
        <label>
          <span>List</span>
          <select
            value={draft.listId}
            disabled={fieldsLocked}
            onChange={(event) => onTaskChange("listId", event.currentTarget.value)}
          >
            <option value={inbox.id}>{inbox.name}</option>
            {regularLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select
            value={draft.priority}
            disabled={fieldsLocked}
            onChange={(event) => onTaskChange("priority", event.currentTarget.value as PlanningPriority)}
          >
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      {listLoading ? (
        <p className={styles.fieldStatus} role="status">
          Loading lists…
        </p>
      ) : null}
      {listError ? (
        <div className={styles.fieldStatus} role="alert">
          <span>Some lists could not be loaded. Inbox remains available.</span>
          <button
            type="button"
            className="quiet-button"
            disabled={fieldsLocked || listLoading}
            onClick={onRetryLists}
          >
            Retry lists
          </button>
        </div>
      ) : listHasNextPage ? (
        <button
          type="button"
          className={styles.loadMore}
          disabled={fieldsLocked || listLoading}
          onClick={onLoadMoreLists}
        >
          Load more lists
        </button>
      ) : null}
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={schedule.allDay}
          disabled={fieldsLocked}
          onChange={(event) => onScheduleChange("allDay", event.currentTarget.checked)}
        />
        <span>All-day schedule</span>
      </label>
      {schedule.allDay ? (
        <div className={styles.fields}>
          <Field
            label="Start date"
            type="date"
            value={schedule.startDate}
            disabled={fieldsLocked}
            onChange={(value) => onScheduleChange("startDate", value)}
          />
          <Field
            label="End date (exclusive)"
            type="date"
            value={schedule.endDate}
            disabled={fieldsLocked}
            onChange={(value) => onScheduleChange("endDate", value)}
          />
        </div>
      ) : (
        <div className={styles.fields}>
          <Field
            label="Start"
            type="datetime-local"
            value={schedule.startLocal}
            disabled={fieldsLocked}
            onChange={(value) => onScheduleChange("startLocal", value)}
          />
          <Field
            label="End"
            type="datetime-local"
            value={schedule.endLocal}
            disabled={fieldsLocked}
            onChange={(value) => onScheduleChange("endLocal", value)}
          />
        </div>
      )}
      <label className={styles.timeZone}>
        <span>Timezone</span>
        <select value={timeZone} disabled aria-label="Schedule timezone">
          <option value={timeZone}>{timeZone}</option>
        </select>
        <small>Change your saved timezone in Settings.</small>
      </label>
    </>
  );
}

function Field({
  disabled,
  label,
  onChange,
  type,
  value,
}: Readonly<{
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  type: "date" | "datetime-local";
  value: string;
}>) {
  return (
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        required
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
