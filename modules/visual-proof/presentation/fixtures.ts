export type FixtureTask = {
  id: string;
  title: string;
  meta: string;
  priority: "high" | "medium" | "low" | "none";
  tag?: string;
  accent?: "coral" | "amber" | "mint" | "sky" | "violet" | "slate";
};

export const overdueTasks: FixtureTask[] = [
  {
    id: "submission-copy",
    title: "Tighten the submission story",
    meta: "Yesterday · 45 min",
    priority: "high",
    tag: "Build Week",
    accent: "coral",
  },
];

export const timedTasks: FixtureTask[] = [
  {
    id: "record-demo",
    title: "Record the two-minute demo",
    meta: "10:30–11:30 AM",
    priority: "high",
    tag: "Launch",
    accent: "violet",
  },
  {
    id: "review-landing",
    title: "Review landing page on mobile",
    meta: "2:00–2:30 PM",
    priority: "medium",
    tag: "Design",
    accent: "sky",
  },
];

export const anytimeTasks: FixtureTask[] = [
  {
    id: "read-rules",
    title: "Recheck the submission rules",
    meta: "Today · Anytime",
    priority: "low",
  },
  {
    id: "prepare-seed",
    title: "Prepare clean demo data",
    meta: "Today · Anytime",
    priority: "medium",
    tag: "Product",
    accent: "amber",
  },
];

export const calendarEvents = [
  { id: "e1", day: 1, start: "09:00", title: "Build task shell", accent: "coral" },
  { id: "e2", day: 2, start: "11:00", title: "Planner review", accent: "violet" },
  { id: "e3", day: 3, start: "10:30", title: "Record demo", accent: "amber" },
  { id: "e4", day: 3, start: "14:00", title: "Mobile review", accent: "sky" },
  { id: "e5", day: 4, start: "09:30", title: "Fix audit notes", accent: "mint" },
  { id: "e6", day: 5, start: "15:30", title: "Submission pass", accent: "coral" },
] as const;

export type ProposalAction = {
  id: string;
  kind: "Schedule" | "Update" | "Create" | "Defer";
  title: string;
  before: string;
  after: string;
  rationale: string;
  selected: boolean;
  tone: "ready" | "attention" | "overflow";
};

export const proposalActions: ProposalAction[] = [
  {
    id: "schedule-demo",
    kind: "Schedule",
    title: "Record the two-minute demo",
    before: "Unscheduled · 60 min",
    after: "Today, 10:30–11:30 AM",
    rationale: "The morning recording window is free and leaves a 30-minute buffer before lunch.",
    selected: true,
    tone: "ready",
  },
  {
    id: "clarify-copy",
    kind: "Update",
    title: "Tighten the submission story",
    before: "No estimate · High priority",
    after: "45 min · Keep high priority",
    rationale: "Your note says this needs one focused editing pass, but the estimate is uncertain.",
    selected: true,
    tone: "attention",
  },
  {
    id: "create-thumbnail",
    kind: "Create",
    title: "Capture a clean project thumbnail",
    before: "New task",
    after: "Today, 3:30–4:00 PM · Medium priority",
    rationale: "This is required for the submission and fits after the mobile review.",
    selected: true,
    tone: "ready",
  },
  {
    id: "defer-readme",
    kind: "Defer",
    title: "Rewrite the full README",
    before: "Today · 120 min",
    after: "Leave unscheduled",
    rationale: "Only 45 minutes remain in the work window. The task cannot fit without overlap.",
    selected: false,
    tone: "overflow",
  },
];
