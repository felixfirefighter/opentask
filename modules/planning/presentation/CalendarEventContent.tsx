import { AlertCircle, CalendarClock } from "lucide-react";

import type { PlanningCalendarEventModel } from "./planning-screen-model";
import styles from "./CalendarEvent.module.css";

export function CalendarEventContent({
  event,
  timeText,
}: Readonly<{ event: PlanningCalendarEventModel; timeText: string }>) {
  return (
    <span className={styles.eventContent} data-category={event.category}>
      <span className={styles.eventTime}>
        <CalendarClock size={12} aria-hidden="true" />
        {event.allDay ? "All day" : timeText}
      </span>
      <strong>{event.title}</strong>
      <span className={styles.eventContext}>
        {event.statusLabel} · {event.categoryLabel}
        {event.conflicted ? (
          <span className={styles.eventConflict}>
            <AlertCircle size={12} aria-hidden="true" /> Changed elsewhere
          </span>
        ) : null}
      </span>
    </span>
  );
}
