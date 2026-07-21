import type { HabitMonthProjection } from "../application/contracts";
import { fullLocalDate, habitDayStatusLabel, monthLabel } from "./habit-view-model";
import styles from "./HabitMonthHeatMap.module.css";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HabitMonthHeatMap({
  month,
  title,
  unit,
}: Readonly<{ month: HabitMonthProjection; title: string; unit: string | null }>) {
  const cells = monthCells(month);
  return (
    <div className={styles.wrapper} tabIndex={0} aria-label={`${monthLabel(month.yearMonth)} heat map`}>
      <table className={styles.table}>
        <caption>
          {monthLabel(month.yearMonth)} history for {title}
        </caption>
        <thead>
          <tr>
            {weekdays.map((weekday) => (
              <th scope="col" key={weekday}>
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day, dayIndex) =>
                day ? (
                  <td key={day.localDate} data-state={day.status}>
                    <span aria-hidden="true">{Number(day.localDate.slice(-2))}</span>
                    <span className="sr-only">
                      {fullLocalDate(day.localDate)}: {habitDayStatusLabel(day, unit)}
                    </span>
                  </td>
                ) : (
                  <td className={styles.outsideMonth} aria-hidden="true" key={`blank-${dayIndex}`} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function monthCells(month: HabitMonthProjection) {
  const first = month.days[0];
  if (!first) return [];
  const sundayBased = new Date(`${first.localDate}T00:00:00.000Z`).getUTCDay();
  const leading = (sundayBased + 6) % 7;
  const values: Array<HabitMonthProjection["days"][number] | null> = [
    ...Array.from({ length: leading }, () => null),
    ...month.days,
  ];
  while (values.length % 7 !== 0) values.push(null);
  const weeks: Array<typeof values> = [];
  for (let index = 0; index < values.length; index += 7) weeks.push(values.slice(index, index + 7));
  return weeks;
}
