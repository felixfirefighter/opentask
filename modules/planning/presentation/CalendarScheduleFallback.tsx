"use client";

import { CalendarClock, ExternalLink } from "lucide-react";

import { Button } from "@/shared/presentation";

import type { PlanningCalendarEventModel } from "./planning-screen-model";
import styles from "./CalendarScreen.module.css";

export function CalendarScheduleFallback({
  disabled,
  events,
  selectedEventId,
  onEditSchedule,
  onOmplish,
  onSelectEvent,
}: Readonly<{
  disabled: boolean;
  events: readonly PlanningCalendarEventModel[];
  selectedEventId: string;
  onEditSchedule: (taskId: string) => void;
  onOmplish: (taskId: string) => void;
  onSelectEvent: (eventId: string) => void;
}>) {
  const selected = events.find((event) => event.id === selectedEventId);
  return (
    <section className={styles.scheduleFallback} aria-labelledby="schedule-without-dragging">
      <div>
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
          <option key={event.id} value={event.id}>
            {event.title} — {event.scheduleLabel}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="secondary"
        disabled={!selected}
        onClick={() => selected && onOmplish(selected.taskId)}
      >
        <ExternalLink size={16} aria-hidden="true" /> Open task
      </Button>
      <Button
        type="button"
        disabled={disabled || !selected}
        title={disabled ? "Schedule editing is unavailable while this view is read-only." : undefined}
        onClick={() => selected && onEditSchedule(selected.taskId)}
      >
        Edit schedule
      </Button>
    </section>
  );
}
