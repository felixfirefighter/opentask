"use client";

import { CalendarClock, ExternalLink } from "lucide-react";

import { Button } from "@/shared/presentation";

import type { PlanningCalendarEventModel, PlanningOccurrenceAction } from "./planning-screen-model";
import styles from "./CalendarScreen.module.css";

export function CalendarScheduleFallback({
  disabled,
  events,
  selectedEventId,
  onEditSchedule,
  onOccurrenceTransition,
  onOpenTask,
  onSelectEvent,
}: Readonly<{
  disabled: boolean;
  events: readonly PlanningCalendarEventModel[];
  selectedEventId: string;
  onEditSchedule: (taskId: string) => void;
  onOccurrenceTransition: (
    taskId: string,
    occurrenceKey: string,
    action: PlanningOccurrenceAction,
    projectionId?: string,
  ) => void;
  onOpenTask: (taskId: string) => void;
  onSelectEvent: (eventId: string) => void;
}>) {
  const selected = events.find((event) => event.projectionId === selectedEventId);
  return (
    <section className={styles.scheduleFallback} aria-labelledby="schedule-without-dragging">
      <div className={styles.scheduleIntro}>
        <CalendarClock size={18} aria-hidden="true" />
        <span>
          <strong id="schedule-without-dragging">Schedule without dragging</strong>
          <small>Choose any visible task, then open the complete date, time, and timezone form.</small>
        </span>
      </div>
      <label className="sr-only" htmlFor="calendar-task-selection">
        Task to edit
      </label>
      <select
        id="calendar-task-selection"
        value={selectedEventId}
        onChange={(event) => onSelectEvent(event.currentTarget.value)}
      >
        <option value="">Choose a task</option>
        {events.map((event) => (
          <option key={event.projectionId} value={event.projectionId}>
            {event.title} — {event.scheduleLabel}
          </option>
        ))}
      </select>
      <div className={styles.scheduleActions}>
        <Button
          type="button"
          variant="secondary"
          disabled={!selected}
          onClick={() => selected && onOpenTask(selected.taskId)}
        >
          <ExternalLink size={16} aria-hidden="true" /> Open task
        </Button>
        <Button
          type="button"
          disabled={disabled || !selected || selected.conflicted}
          title={
            selected?.conflicted
              ? "Open task details to review the latest saved schedule."
              : disabled
                ? "Schedule editing is unavailable while this view is read-only."
                : undefined
          }
          onClick={() => {
            if (!selected) return;
            if (selected.scheduleInteraction.editScope === "series") onOpenTask(selected.taskId);
            else onEditSchedule(selected.taskId);
          }}
        >
          {selected?.scheduleInteraction.editScope === "series"
            ? "Edit future series schedule"
            : "Edit schedule"}
        </Button>
        {selected?.projectionLifecycle === "recurring_occurrence" && selected.occurrenceKey ? (
          <OccurrenceFallbackActions
            disabled={disabled || Boolean(selected.conflicted)}
            event={selected}
            onTransition={onOccurrenceTransition}
          />
        ) : null}
      </div>
    </section>
  );
}

function OccurrenceFallbackActions({
  disabled,
  event,
  onTransition,
}: Readonly<{
  disabled: boolean;
  event: PlanningCalendarEventModel;
  onTransition: (
    taskId: string,
    occurrenceKey: string,
    action: PlanningOccurrenceAction,
    projectionId?: string,
  ) => void;
}>) {
  const occurrenceKey = event.occurrenceKey;
  if (occurrenceKey === null) return null;
  if (event.occurrenceState !== "open") {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => onTransition(event.taskId, occurrenceKey, "undo", event.projectionId)}
      >
        Undo occurrence
      </Button>
    );
  }
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => onTransition(event.taskId, occurrenceKey, "complete", event.projectionId)}
      >
        Complete occurrence
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => onTransition(event.taskId, occurrenceKey, "skip", event.projectionId)}
      >
        Skip occurrence
      </Button>
    </>
  );
}
