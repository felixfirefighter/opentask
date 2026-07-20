import type {
  CalendarEventDto,
  CalendarProjection,
  EisenhowerProjection,
  PlanningTaskRow,
  TodayProjection,
  UpcomingProjection,
} from "../application/public";
import type {
  CalendarPlanningModel,
  CalendarView,
  MatrixPlanningModel,
  PlanningCalendarEventModel,
  PlanningCategory,
  PlanningTaskRowModel,
  TodayPlanningModel,
  UpcomingPlanningModel,
} from "./planning-screen-model";
import { planningTaskDetailsHref } from "./planning-task-navigation";

type FormatOptions = Readonly<{
  conflictedTaskId?: string | null | undefined;
  hourCycle: "12" | "24";
  taskReturnTo?: string | null | undefined;
}>;

const categories = ["coral", "amber", "mint", "sky", "violet", "slate"] as const;

export function toTodayPlanningModel(
  projection: TodayProjection,
  options: FormatOptions,
): TodayPlanningModel {
  const date = formatLocalDate(projection.localDate, { weekday: "long", month: "long", day: "numeric" });
  return {
    localDateLabel: date,
    localWeekdayLabel: formatLocalDate(projection.localDate, { weekday: "long" }),
    timeZoneLabel: projection.timeZone,
    remainingLabel: countLabel(projection.remainingCount, "task", "remaining"),
    overdue: projection.overdue.map((task) => toTaskRowModel(task, projection.timeZone, options)),
    timed: projection.timed.map((task) => toTaskRowModel(task, projection.timeZone, options)),
    anytime: projection.anytime.map((task) => toTaskRowModel(task, projection.timeZone, options)),
  };
}

export function toUpcomingPlanningModel(
  projection: UpcomingProjection,
  options: FormatOptions,
): UpcomingPlanningModel {
  return {
    rangeLabel: formatDateRange(projection.rangeStartDate, projection.rangeEndDate),
    timeZoneLabel: projection.timeZone,
    totalLabel: countLabel(projection.remainingCount, "scheduled task", "in the next 7 days"),
    groups: projection.days.map((day) => ({
      id: day.localDate,
      dateLabel: formatLocalDate(day.localDate, { weekday: "long", month: "short", day: "numeric" }),
      tasks: day.items.map((task) => toTaskRowModel(task, projection.timeZone, options)),
    })),
  };
}

export function toMatrixPlanningModel(
  projection: EisenhowerProjection,
  options: FormatOptions,
): MatrixPlanningModel {
  const task = (row: PlanningTaskRow) => toTaskRowModel(row, projection.timeZone, options);
  return {
    boundaryLabel: `Urgent means overdue or due before ${formatInstant(projection.urgentThroughAt, projection.timeZone, options.hourCycle)}.`,
    quadrants: {
      doNow: quadrant("do-now", "Do now", "Important + urgent", "coral", projection.doNow.map(task)),
      plan: quadrant("plan", "Plan", "Important + not urgent", "violet", projection.plan.map(task)),
      timeSensitive: quadrant(
        "time-sensitive",
        "Time-sensitive",
        "Not important + urgent",
        "amber",
        projection.timeSensitive.map(task),
      ),
      later: quadrant("later", "Later", "Not important + not urgent", "slate", projection.later.map(task)),
    },
  };
}

export function toCalendarPlanningModel(
  projection: CalendarProjection,
  options: FormatOptions &
    Readonly<{
      view: CalendarView;
      hasSavedView: boolean;
      initialDate: string;
      weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }>,
): CalendarPlanningModel {
  return {
    view: options.view,
    hasSavedView: options.hasSavedView,
    initialDate: options.initialDate,
    rangeLabel: formatDateRange(projection.rangeStartDate, projection.rangeEndDate),
    timeZone: projection.timeZone,
    timeZoneLabel: projection.timeZone,
    weekStartsOn: options.weekStartsOn,
    hourCycle: options.hourCycle,
    events: projection.events.map((event) => toCalendarEventModel(event, projection.timeZone, options)),
  };
}

export function projectionTaskState(rows: readonly PlanningTaskRow[]) {
  return new Map(rows.map((row) => [row.id, { version: row.version, schedule: row.schedule }] as const));
}

function toTaskRowModel(
  task: PlanningTaskRow,
  timeZone: string,
  options: FormatOptions,
): PlanningTaskRowModel {
  return {
    id: task.id,
    title: task.title,
    detailsHref: planningTaskDetailsHref(task.id, options.taskReturnTo),
    status: task.status,
    priority: task.priority,
    scheduleLabel: scheduleLabel(task.schedule, timeZone, options.hourCycle),
    contextLabel: "Task",
    category: categoryFor(task.listId),
    conflicted: options.conflictedTaskId === task.id || undefined,
  };
}

function toCalendarEventModel(
  event: CalendarEventDto,
  timeZone: string,
  options: FormatOptions,
): PlanningCalendarEventModel {
  const category = categoryFor(event.listId);
  const bounds =
    event.kind === "all_day"
      ? { start: event.startDate, end: event.endDate, allDay: true }
      : { start: event.startAt, end: event.endAt, allDay: false };
  return {
    id: event.taskId,
    taskId: event.taskId,
    title: event.title,
    detailsHref: planningTaskDetailsHref(event.taskId, options.taskReturnTo),
    ...bounds,
    scheduleLabel: scheduleLabel(event, timeZone, options.hourCycle),
    statusLabel: "Open",
    categoryLabel: "Task",
    category,
    conflicted: options.conflictedTaskId === event.taskId || undefined,
  };
}

function quadrant<TId extends "do-now" | "plan" | "time-sensitive" | "later">(
  id: TId,
  title: string,
  ruleLabel: string,
  category: PlanningCategory,
  tasks: readonly PlanningTaskRowModel[],
) {
  return { id, title, ruleLabel, category, tasks };
}

function scheduleLabel(
  schedule: PlanningTaskRow["schedule"] | CalendarEventDto,
  timeZone: string,
  hourCycle: "12" | "24",
) {
  if (schedule === null) return "Unscheduled";
  if (schedule.kind === "all_day") {
    const start = "startDate" in schedule ? schedule.startDate : "";
    return `${formatLocalDate(start, { month: "short", day: "numeric" })} · Anytime`;
  }
  const start = "startAt" in schedule ? schedule.startAt : "";
  const end = "endAt" in schedule ? schedule.endAt : "";
  const formatter = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hourCycle === "12" ? "h12" : "h23",
    timeZone,
  });
  return `${formatter.format(new Date(start))}–${formatter.format(new Date(end))}`;
}

function formatInstant(instant: string, timeZone: string, hourCycle: "12" | "24") {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hourCycle === "12" ? "h12" : "h23",
    timeZone,
  }).format(new Date(instant));
}

function formatLocalDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );
}

function formatDateRange(start: string, exclusiveEnd: string) {
  const end = new Date(`${exclusiveEnd}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const startLabel = formatLocalDate(start, { month: "short", day: "numeric", year: "numeric" });
  const endLabel = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function categoryFor(listId: string): PlanningCategory {
  let hash = 0;
  for (const character of listId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return categories[hash % categories.length] ?? "slate";
}

function countLabel(count: number, noun: string, suffix: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"} ${suffix}`;
}
