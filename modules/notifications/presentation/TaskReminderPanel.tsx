"use client";

import { Bell, BellOff } from "lucide-react";

import { isNotificationApiError } from "./data/notification-api-request";
import {
  describeReminderDormancy,
  type ReminderRecurrence,
  type ReminderSchedule,
} from "./reminder-dormancy-policy";
import { reminderSummary, type ReminderKind } from "./reminder-form-policy";
import { TaskReminderForm } from "./TaskReminderForm";
import { TaskReminderDeliveryStatus } from "./TaskReminderDeliveryStatus";
import styles from "./TaskReminderPanel.module.css";
import { notificationErrorMessage, TaskReminderActions, TaskReminderState } from "./TaskReminderSummary";
import { useReminderInstantPassed } from "./use-reminder-instant-passed";
import { useTaskReminderController } from "./use-task-reminder-controller";

type ReminderDependency<T> =
  | Readonly<{ status: "loading"; retry: () => void }>
  | Readonly<{ status: "error"; permissionSafe: boolean; retry: () => void }>
  | Readonly<{ status: "ready"; value: T; stale: boolean; retry: () => void }>;

export type TaskReminderPanelProps = Readonly<{
  task: Readonly<{
    id: string;
    status: "open" | "completed" | "cancelled";
    deleted: boolean;
    parentTaskId: string | null;
  }>;
  schedule: ReminderDependency<ReminderSchedule>;
  recurrence: ReminderDependency<ReminderRecurrence>;
  timeZone: string;
  disabled: boolean;
}>;

export function TaskReminderPanel(props: TaskReminderPanelProps) {
  const allowedKinds = reminderKinds(props);
  const controller = useTaskReminderController({
    allowedKinds,
    taskId: props.task.id,
    timeZone: props.timeZone,
  });
  const unavailableTask = props.task.deleted || props.task.status !== "open";
  const reminderInstantPassed = useReminderInstantPassed({
    recurrence: props.recurrence.status === "ready" ? props.recurrence.value : null,
    schedule: props.schedule.status === "ready" ? props.schedule.value : null,
    spec: controller.reminder?.spec ?? null,
  });

  if (controller.query.isError && controller.query.data === undefined) {
    const permissionSafe =
      isNotificationApiError(controller.query.error) &&
      (controller.query.error.code === "FORBIDDEN" || controller.query.error.code === "NOT_FOUND");
    return (
      <TaskReminderState
        taskId={props.task.id}
        message={permissionSafe ? "Reminder unavailable." : "Reminder could not be loaded."}
        action={
          !permissionSafe && !props.disabled ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void controller.query.refetch()}
            >
              Try again
            </button>
          ) : null
        }
      />
    );
  }
  const dependencyFailed = props.schedule.status === "error" || props.recurrence.status === "error";
  if (dependencyFailed) {
    const permissionSafe =
      (props.schedule.status === "error" && props.schedule.permissionSafe) ||
      (props.recurrence.status === "error" && props.recurrence.permissionSafe);
    return (
      <TaskReminderState
        taskId={props.task.id}
        message={
          permissionSafe
            ? "Reminder unavailable."
            : props.disabled
              ? "Reminder timing is unavailable while offline. Reconnect to load it."
              : "Reminder timing could not be loaded."
        }
        action={
          !permissionSafe && !props.disabled ? (
            <button className="secondary-button" type="button" onClick={() => retryDependencies(props)}>
              Try again
            </button>
          ) : null
        }
      />
    );
  }
  if (
    controller.query.isPending ||
    props.schedule.status !== "ready" ||
    props.recurrence.status !== "ready"
  ) {
    return <TaskReminderState taskId={props.task.id} message="Loading reminder…" busy />;
  }

  const reminder = controller.reminder;
  const timingStale = props.schedule.stale || props.recurrence.stale;
  const dormantReason = reminder
    ? describeReminderDormancy({
        kind: reminder.spec.kind,
        recurrence: props.recurrence.value,
        reminderInstantPassed,
        schedule: props.schedule.value,
        task: props.task,
      })
    : null;
  return (
    <section className={styles.group} aria-labelledby={`reminder-title-${props.task.id}`}>
      <div className={styles.heading}>
        <div>
          <div className={styles.titleLine}>
            <h2 id={`reminder-title-${props.task.id}`}>Reminder</h2>
            {reminder ? (
              <span
                className={styles.badge}
                data-state={dormantReason ? "dormant" : reminder.enabled ? "on" : "off"}
              >
                {dormantReason ? "Dormant" : reminder.enabled ? "Enabled" : "Disabled"}
              </span>
            ) : null}
          </div>
          <p>{reminder ? reminderSummary(reminder, props.timeZone) : "No reminder"}</p>
        </div>
        {reminder?.enabled ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
      </div>

      {dormantReason ? <p className={styles.notice}>{dormantReason}</p> : null}
      {timingStale ? (
        <div className={styles.stale} role="status">
          <span>Showing the last loaded reminder timing. A fresh copy could not be loaded.</span>
          <button
            className="quiet-button"
            type="button"
            disabled={props.disabled}
            onClick={() => retryDependencies(props)}
          >
            Refresh reminder timing
          </button>
        </div>
      ) : null}
      <TaskReminderDeliveryStatus online={!props.disabled} />

      {controller.editing && controller.draft ? (
        <TaskReminderForm
          allowedKinds={allowedKinds}
          conflict={controller.conflict}
          latestReloaded={controller.latestReloaded}
          draft={controller.draft}
          disabled={props.disabled}
          errorMessage={notificationErrorMessage(controller.error, controller.conflict)}
          interpretation={controller.interpretation}
          pending={controller.pending}
          taskId={props.task.id}
          onCancel={controller.cancelEditing}
          onChange={controller.setDraft}
          onReloadLatest={() => void controller.reloadLatest()}
          onSave={() => void controller.save()}
        />
      ) : (
        <TaskReminderActions
          controller={controller}
          canEdit={!unavailableTask}
          disabled={props.disabled}
          hasReminder={Boolean(reminder)}
        />
      )}
    </section>
  );
}

function reminderKinds(props: TaskReminderPanelProps): readonly ReminderKind[] {
  if (props.recurrence.status === "ready" && props.recurrence.value !== "none") {
    return ["relative_start"];
  }
  return props.schedule.status === "ready" && props.schedule.value?.kind === "timed"
    ? ["absolute", "relative_start"]
    : ["absolute"];
}

function retryDependencies(props: TaskReminderPanelProps) {
  props.schedule.retry();
  props.recurrence.retry();
}
