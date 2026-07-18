import { Bell, CalendarClock, Repeat2 } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { calendarEvents } from "../fixtures";
import styles from "./CalendarScreen.module.css";

export type CalendarView = "Month" | "Week" | "Day" | "Agenda";

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const dates = [20, 21, 22, 23, 24];
const monthCells = Array.from({ length: 35 }, (_, index) => index - 1);

export function CalendarViews({ view }: { view: CalendarView }) {
  if (view === "Agenda") return <AgendaView />;
  if (view === "Month") return <MonthView />;
  return <TimeGrid dayOnly={view === "Day"} />;
}

function MonthView() {
  return (
    <section className={styles.calendarCard} aria-label="July 2026 month calendar">
      <div className={styles.weekdayRow} aria-hidden="true">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {monthCells.map((value) => {
          const day = value <= 0 ? 30 + value : value > 31 ? value - 31 : value;
          const outside = value <= 0 || value > 31;
          const events =
            !outside && value >= 20 && value <= 24
              ? calendarEvents.filter((event) => event.day === value - 19)
              : [];
          return (
            <div className={styles.dayCell} data-outside={outside || undefined} key={`${value}-${day}`}>
              <span className={styles.dayNumber} data-today={value === 18 || undefined}>
                {day}
              </span>
              {events.map((event) => (
                <EventLink key={event.id} event={event} compact />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TimeGrid({ dayOnly }: { dayOnly: boolean }) {
  const visibleDays = dayOnly ? [2] : [0, 1, 2, 3, 4];
  return (
    <section className={styles.calendarCard} aria-label={dayOnly ? "Day time grid" : "Week time grid"}>
      <div className={styles.timeHeader} style={{ "--days": visibleDays.length } as CSSProperties}>
        <span />
        {visibleDays.map((dayIndex) => (
          <div key={dayIndex}>
            <span>{weekdayNames[dayIndex]?.slice(0, 3)}</span>
            <strong>{dates[dayIndex]}</strong>
          </div>
        ))}
      </div>
      <div className={styles.timeGrid} style={{ "--days": visibleDays.length } as CSSProperties}>
        <div className={styles.timeLabels}>
          {["8 AM", "10 AM", "12 PM", "2 PM", "4 PM"].map((time) => (
            <span key={time}>{time}</span>
          ))}
        </div>
        {visibleDays.map((dayIndex) => (
          <div className={styles.timeColumn} key={dayIndex}>
            {calendarEvents
              .filter((event) => event.day === dayIndex + 1)
              .map((event) => (
                <EventLink key={event.id} event={event} />
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function AgendaView() {
  return (
    <section className={styles.agenda} aria-label="Agenda for 20 to 24 July 2026">
      {weekdayNames.map((day, index) => {
        const events = calendarEvents.filter((event) => event.day === index + 1);
        return (
          <article className={styles.agendaDay} key={day}>
            <header>
              <span>{day.slice(0, 3)}</span>
              <strong>{dates[index]}</strong>
            </header>
            <div className={styles.agendaEvents}>
              {events.map((event) => (
                <Link
                  href="/tasks/demo"
                  className={styles.agendaEvent}
                  data-accent={event.accent}
                  key={event.id}
                >
                  <time>{event.start}</time>
                  <span>
                    <strong>{event.title}</strong>
                    <small>Build Week · 60 min</small>
                  </span>
                  {event.id === "e3" ? (
                    <Bell size={15} aria-label="Reminder set" />
                  ) : (
                    <Repeat2 size={15} aria-label="Recurring" />
                  )}
                </Link>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function EventLink({
  event,
  compact = false,
}: {
  event: (typeof calendarEvents)[number];
  compact?: boolean;
}) {
  return (
    <Link
      href="/tasks/demo"
      className={compact ? styles.monthEvent : styles.gridEvent}
      data-accent={event.accent}
      aria-label={`${event.title}, ${event.start}`}
    >
      {compact ? (
        <>
          <span>{event.start}</span>
          {event.title}
        </>
      ) : (
        <>
          <CalendarClock size={13} /> <strong>{event.title}</strong>
          <span>{event.start}</span>
        </>
      )}
    </Link>
  );
}
