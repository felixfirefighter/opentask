import type { HabitDayProjection } from "../application/contracts";
import { compactLocalDay, fullLocalDate, habitDayStatusLabel } from "./habit-view-model";
import styles from "./HabitSevenDayStrip.module.css";

export function HabitSevenDayStrip({
  days,
  title,
  unit,
}: Readonly<{
  days: readonly HabitDayProjection[];
  title: string;
  unit: string | null;
}>) {
  return (
    <ol className={styles.strip} aria-label={`Seven-day history for ${title}`}>
      {days.map((day) => {
        const label = compactLocalDay(day.localDate);
        return (
          <li
            key={day.localDate}
            data-state={day.status}
            aria-label={`${fullLocalDate(day.localDate)}: ${habitDayStatusLabel(day, unit)}`}
          >
            <span>{label.day}</span>
            <strong>{label.date}</strong>
          </li>
        );
      })}
    </ol>
  );
}
