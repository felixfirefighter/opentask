import type {
  CalendarPlanningModel,
  MatrixPlanningModel,
  PlanningTaskRowModel,
  TodayPlanningModel,
  UpcomingPlanningModel,
} from "./planning-screen-model";

function oneOffIdentity(taskId: string) {
  return {
    projectionId: `task:${taskId}`,
    taskId,
    projectionLifecycle: "one_off" as const,
    occurrenceKey: null,
    occurrenceState: null,
    transitionEligible: null,
    recurrenceSummary: null,
    scheduleInteraction: { editScope: "task" as const, dragEnabled: true, dragDisabledReason: null },
  };
}

const taskBase: Readonly<Record<string, PlanningTaskRowModel>> = {
  story: {
    ...oneOffIdentity("task-story"),
    title: "Confirm the workshop goals",
    detailsHref: "/tasks/task-story",
    status: "open",
    priority: "high",
    scheduleLabel: "Overdue · Sunday",
    contextLabel: "Community",
    category: "coral",
  },
  demo: {
    ...oneOffIdentity("task-demo"),
    title: "Outline the workshop agenda",
    detailsHref: "/tasks/task-demo",
    status: "open",
    priority: "high",
    scheduleLabel: "10:30–11:30 AM",
    contextLabel: "Event",
    category: "violet",
  },
  review: {
    ...oneOffIdentity("task-review"),
    title: "Review the event page on mobile",
    detailsHref: "/tasks/task-review",
    status: "open",
    priority: "medium",
    scheduleLabel: "2:00–2:30 PM",
    contextLabel: "Design",
    category: "sky",
  },
  seed: {
    ...oneOffIdentity("task-seed"),
    title: "Prepare attendee notes",
    detailsHref: "/tasks/task-seed",
    status: "open",
    priority: "medium",
    scheduleLabel: "All day",
    contextLabel: "Planning",
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
      projectionId: task("demo").projectionId,
      taskId: task("demo").taskId,
      title: task("demo").title,
      detailsHref: task("demo").detailsHref,
      start: "2026-07-20T10:30:00+08:00",
      end: "2026-07-20T11:30:00+08:00",
      allDay: false,
      projectionLifecycle: "one_off",
      occurrenceKey: null,
      occurrenceState: null,
      transitionEligible: null,
      recurrenceSummary: null,
      scheduleInteraction: { editScope: "task", dragEnabled: true, dragDisabledReason: null },
      scheduleLabel: "Monday, 20 July, 10:30–11:30 AM",
      statusLabel: "Open",
      categoryLabel: "Event",
      category: "violet",
    },
    {
      projectionId: task("seed").projectionId,
      taskId: task("seed").taskId,
      title: task("seed").title,
      detailsHref: task("seed").detailsHref,
      start: "2026-07-21",
      end: "2026-07-22",
      allDay: true,
      projectionLifecycle: "one_off",
      occurrenceKey: null,
      occurrenceState: null,
      transitionEligible: null,
      recurrenceSummary: null,
      scheduleInteraction: { editScope: "task", dragEnabled: true, dragDisabledReason: null },
      scheduleLabel: "Tuesday, 21 July, all day",
      statusLabel: "Open",
      categoryLabel: "Planning",
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
