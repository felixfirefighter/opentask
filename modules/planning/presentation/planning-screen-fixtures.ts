import type {
  CalendarPlanningModel,
  MatrixPlanningModel,
  PlanningTaskRowModel,
  TodayPlanningModel,
  UpcomingPlanningModel,
} from "./planning-screen-model";

const taskBase: Readonly<Record<string, PlanningTaskRowModel>> = {
  story: {
    id: "task-story",
    title: "Tighten the submission story",
    detailsHref: "/tasks/task-story",
    status: "open",
    priority: "high",
    scheduleLabel: "Overdue · Sunday",
    contextLabel: "Build Week",
    category: "coral",
  },
  demo: {
    id: "task-demo",
    title: "Record the two-minute demo",
    detailsHref: "/tasks/task-demo",
    status: "open",
    priority: "high",
    scheduleLabel: "10:30–11:30 AM",
    contextLabel: "Launch",
    category: "violet",
  },
  review: {
    id: "task-review",
    title: "Review the landing page on mobile",
    detailsHref: "/tasks/task-review",
    status: "open",
    priority: "medium",
    scheduleLabel: "2:00–2:30 PM",
    contextLabel: "Design",
    category: "sky",
  },
  seed: {
    id: "task-seed",
    title: "Prepare clean demo data",
    detailsHref: "/tasks/task-seed",
    status: "open",
    priority: "medium",
    scheduleLabel: "All day",
    contextLabel: "Product",
    category: "amber",
  },
};

const task = (key: keyof typeof taskBase) => taskBase[key]!;

export const todayFixture: TodayPlanningModel = {
  localDateLabel: "20 July 2026",
  localWeekdayLabel: "Monday",
  timeZoneLabel: "Singapore time",
  remainingLabel: "4 tasks remaining",
  overdue: [task("story")],
  timed: [task("demo"), task("review")],
  anytime: [task("seed")],
};

export const upcomingFixture: UpcomingPlanningModel = {
  rangeLabel: "20–26 July 2026",
  timeZoneLabel: "Singapore time",
  totalLabel: "4 tasks in the next 7 days",
  groups: [
    { id: "2026-07-20", dateLabel: "Monday, 20 July", tasks: [task("demo"), task("review")] },
    { id: "2026-07-21", dateLabel: "Tuesday, 21 July", tasks: [task("seed")] },
    { id: "2026-07-22", dateLabel: "Wednesday, 22 July", tasks: [task("story")] },
  ],
};

export const calendarFixture: CalendarPlanningModel = {
  view: "month",
  hasSavedView: false,
  initialDate: "2026-07-20",
  rangeLabel: "July 2026",
  timeZone: "Asia/Singapore",
  timeZoneLabel: "Singapore time",
  weekStartsOn: 1,
  hourCycle: "12",
  selectedEventId: null,
  events: [
    {
      id: "event-demo",
      taskId: task("demo").id,
      title: task("demo").title,
      detailsHref: task("demo").detailsHref,
      start: "2026-07-20T10:30:00+08:00",
      end: "2026-07-20T11:30:00+08:00",
      allDay: false,
      scheduleLabel: "Monday, 20 July, 10:30–11:30 AM",
      statusLabel: "Open",
      categoryLabel: "Launch",
      category: "violet",
    },
    {
      id: "event-seed",
      taskId: task("seed").id,
      title: task("seed").title,
      detailsHref: task("seed").detailsHref,
      start: "2026-07-21",
      end: "2026-07-22",
      allDay: true,
      scheduleLabel: "Tuesday, 21 July, all day",
      statusLabel: "Open",
      categoryLabel: "Product",
      category: "amber",
    },
  ],
};

export const matrixFixture: MatrixPlanningModel = {
  boundaryLabel: "Urgent means due by Tuesday, 21 July at 5:00 PM Singapore time.",
  quadrants: {
    doNow: {
      id: "do-now",
      title: "Do now",
      ruleLabel: "Important + urgent",
      tasks: [task("story")],
      category: "coral",
    },
    plan: {
      id: "plan",
      title: "Plan",
      ruleLabel: "Important + not urgent",
      tasks: [task("demo")],
      category: "violet",
    },
    timeSensitive: {
      id: "time-sensitive",
      title: "Time-sensitive",
      ruleLabel: "Not important + urgent",
      tasks: [task("review")],
      category: "amber",
    },
    later: {
      id: "later",
      title: "Later",
      ruleLabel: "Not important + not urgent",
      tasks: [task("seed")],
      category: "sky",
    },
  },
};

export function planningTaskFixture(overrides: Partial<PlanningTaskRowModel> = {}): PlanningTaskRowModel {
  return { ...task("demo"), ...overrides };
}
