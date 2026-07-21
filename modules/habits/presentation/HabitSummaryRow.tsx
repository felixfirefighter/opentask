import Link from "next/link";
import type { ReactNode } from "react";

import type { HabitOverview } from "../application/contracts";
import {
  habitDayStatusLabel,
  habitGoalLabel,
  habitScheduleLabel,
  habitStreakLabel,
} from "./habit-view-model";
import { HabitSevenDayStrip } from "./HabitSevenDayStrip";
import styles from "./HabitSummaryRow.module.css";

export function HabitSummaryRow({
  action,
  overview,
}: Readonly<{ action?: ReactNode; overview: HabitOverview }>) {
  const { detail, streak, sevenDay, today, weeklyProgress } = overview;
  const unit = detail.habit.goal.goalKind === "quantity" ? detail.habit.goal.unit : null;
  return (
    <article className={styles.row} data-color={detail.habit.colorToken}>
      <span className={styles.icon} aria-hidden="true">
        {detail.habit.icon}
      </span>
      <div className={styles.content}>
        <Link
          aria-label={`Open ${detail.habit.title}`}
          className={styles.open}
          href={`/habits/${detail.habit.id}`}
          prefetch={false}
        >
          <span className={styles.titleLine}>
            <strong>{detail.habit.title}</strong>
            <span className={styles.category}>{categoryLabel(detail.habit.colorToken)}</span>
          </span>
          <span className={styles.metadata}>
            {habitGoalLabel(detail.habit.goal)} · {habitScheduleLabel(detail.schedule.schedule)}
          </span>
          <span className={styles.progress}>
            {weeklyProgress
              ? `${weeklyProgress.completedDays} of ${weeklyProgress.targetPerWeek} days${weeklyProgress.achieved ? " · Achieved" : ""}`
              : habitDayStatusLabel(today, unit)}
            {" · "}
            {habitStreakLabel(streak)}
          </span>
        </Link>
        <HabitSevenDayStrip days={sevenDay} title={detail.habit.title} unit={unit} />
      </div>
      <div className={styles.trailing}>{action}</div>
    </article>
  );
}

function categoryLabel(token: HabitOverview["detail"]["habit"]["colorToken"]) {
  return token.charAt(0).toLocaleUpperCase() + token.slice(1);
}
