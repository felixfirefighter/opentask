import type {
  HabitDayProjection,
  HabitGoal,
  HabitScheduleValue,
  HabitStreakProjection,
} from "../application/contracts";

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function habitGoalLabel(goal: HabitGoal): string {
  return goal.goalKind === "boolean" ? "Check in once" : `${formatNumber(goal.targetValue)} ${goal.unit}`;
}

export function habitScheduleLabel(schedule: HabitScheduleValue): string {
  const range = schedule.endDate
    ? ` · ${shortDate(schedule.startDate)}–${shortDate(schedule.endDate)}`
    : ` · from ${shortDate(schedule.startDate)}`;
  if (schedule.kind === "daily") return `Daily${range}`;
  if (schedule.kind === "weekly_target") {
    return `${schedule.targetPerWeek} ${schedule.targetPerWeek === 1 ? "day" : "days"} each week${range}`;
  }
  return `${schedule.weekdays.map((day) => weekdayNames[day - 1]).join(", ")}${range}`;
}

export function habitStreakLabel(streak: HabitStreakProjection): string {
  const unit = streak.cadence === "week" ? "week" : "day";
  return `Current ${streak.current} ${plural(streak.current, unit)} · Best ${streak.best} ${plural(streak.best, unit)}`;
}

export function habitDayStatusLabel(day: HabitDayProjection, unit: string | null): string {
  const value = day.log?.quantity;
  const quantity =
    value === null || value === undefined || unit === null ? "" : `, ${formatNumber(value)} ${unit}`;
  switch (day.status) {
    case "successful":
      return `Completed${quantity}`;
    case "partial":
      return `Recorded${quantity}, below target`;
    case "skipped":
      return "Skipped";
    case "unachieved":
      return "Marked unachieved";
    case "open":
      return "Open";
    case "future":
      return "Future";
    case "not_scheduled":
      return "Not scheduled";
    case "outside_range":
      return "Outside schedule";
  }
}

export function fullLocalDate(localDate: string): string {
  return dateFormatter("en", { dateStyle: "full" }).format(plainDate(localDate));
}

export function compactLocalDay(localDate: string): Readonly<{ day: string; date: string }> {
  const date = plainDate(localDate);
  return {
    day: dateFormatter("en", { weekday: "narrow" }).format(date),
    date: dateFormatter("en", { day: "numeric" }).format(date),
  };
}

export function monthLabel(yearMonth: string): string {
  return dateFormatter("en", { month: "long", year: "numeric" }).format(plainDate(`${yearMonth}-01`));
}

export function currentYearMonth(localDate: string): string {
  return localDate.slice(0, 7);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(value);
}

function shortDate(localDate: string): string {
  return dateFormatter("en", { day: "numeric", month: "short" }).format(plainDate(localDate));
}

function plainDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
}

function plural(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`;
}
