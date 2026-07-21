import {
  createHabitRequestSchema,
  habitScheduleValueSchema,
  updateHabitRequestSchema,
  type CreateHabitRequest,
  type HabitDetailDto,
  type HabitScheduleValue,
  type UpdateHabitRequest,
} from "../application/contracts";

export type HabitFormDraft = Readonly<{
  title: string;
  icon: string;
  colorToken: CreateHabitRequest["colorToken"];
  goalKind: "boolean" | "quantity";
  targetValue: string;
  unit: string;
  scheduleKind: "daily" | "weekdays" | "weekly_target";
  weekdays: readonly number[];
  targetPerWeek: string;
  timezone: string;
  startDate: string;
  endDate: string;
}>;

export type HabitFormResult =
  | Readonly<{ success: true; value: CreateHabitRequest }>
  | Readonly<{ success: false; field: keyof HabitFormDraft; message: string }>;

export const habitColorOptions: ReadonlyArray<
  Readonly<{ label: string; value: CreateHabitRequest["colorToken"] }>
> = [
  { label: "Coral", value: "coral" },
  { label: "Amber", value: "amber" },
  { label: "Mint", value: "mint" },
  { label: "Sky", value: "sky" },
  { label: "Violet", value: "violet" },
  { label: "Slate", value: "slate" },
];

export const habitWeekdayOptions = [
  { label: "Monday", shortLabel: "Mon", value: 1 },
  { label: "Tuesday", shortLabel: "Tue", value: 2 },
  { label: "Wednesday", shortLabel: "Wed", value: 3 },
  { label: "Thursday", shortLabel: "Thu", value: 4 },
  { label: "Friday", shortLabel: "Fri", value: 5 },
  { label: "Saturday", shortLabel: "Sat", value: 6 },
  { label: "Sunday", shortLabel: "Sun", value: 7 },
] as const;

export function emptyHabitDraft(timezone: string, localDate: string): HabitFormDraft {
  return {
    title: "",
    icon: "✓",
    colorToken: "mint",
    goalKind: "boolean",
    targetValue: "1",
    unit: "times",
    scheduleKind: "daily",
    weekdays: [1, 2, 3, 4, 5],
    targetPerWeek: "3",
    timezone,
    startDate: localDate,
    endDate: "",
  };
}

export function draftFromHabit(detail: HabitDetailDto): HabitFormDraft {
  const { habit, schedule: scheduleDto } = detail;
  const schedule = scheduleDto.schedule;
  return {
    title: habit.title,
    icon: habit.icon,
    colorToken: habit.colorToken,
    goalKind: habit.goal.goalKind,
    targetValue: habit.goal.goalKind === "quantity" ? String(habit.goal.targetValue) : "1",
    unit: habit.goal.goalKind === "quantity" ? habit.goal.unit : "times",
    scheduleKind: schedule.kind,
    weekdays: schedule.kind === "weekdays" ? schedule.weekdays : [1, 2, 3, 4, 5],
    targetPerWeek: schedule.kind === "weekly_target" ? String(schedule.targetPerWeek) : "3",
    timezone: schedule.timezone,
    startDate: schedule.startDate,
    endDate: schedule.endDate ?? "",
  };
}

export function parseHabitDraft(draft: HabitFormDraft): HabitFormResult {
  if (draft.endDate && draft.startDate && draft.endDate < draft.startDate) {
    return {
      success: false,
      field: "endDate",
      message: "A habit schedule end date cannot precede its start date.",
    };
  }
  const targetValue = Number(draft.targetValue);
  const targetPerWeek = Number(draft.targetPerWeek);
  const schedule = scheduleFromDraft(draft, targetPerWeek);
  const candidate = {
    title: draft.title,
    icon: draft.icon,
    colorToken: draft.colorToken,
    goal:
      draft.goalKind === "boolean"
        ? { goalKind: "boolean" as const, targetValue: null, unit: null }
        : { goalKind: "quantity" as const, targetValue, unit: draft.unit },
    schedule,
  };
  const parsed = createHabitRequestSchema.safeParse(candidate);
  if (parsed.success) return { success: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    success: false,
    field: formFieldForPath(issue?.path ?? []),
    message: issue?.message ?? "Review the habit fields and try again.",
  };
}

export function definitionUpdate(detail: HabitDetailDto, draft: HabitFormDraft): UpdateHabitRequest | null {
  const parsed = parseHabitDraft(draft);
  if (!parsed.success) throw new Error(parsed.message);
  const patch: UpdateHabitRequest["patch"] = {
    ...(parsed.value.title !== detail.habit.title ? { title: parsed.value.title } : {}),
    ...(parsed.value.icon !== detail.habit.icon ? { icon: parsed.value.icon } : {}),
    ...(parsed.value.colorToken !== detail.habit.colorToken ? { colorToken: parsed.value.colorToken } : {}),
    ...(JSON.stringify(parsed.value.goal) !== JSON.stringify(detail.habit.goal)
      ? { goal: parsed.value.goal }
      : {}),
  };
  if (Object.keys(patch).length === 0) return null;
  return updateHabitRequestSchema.parse({
    expectedVersion: detail.habit.version,
    patch,
  });
}

export function scheduleUpdate(draft: HabitFormDraft): HabitScheduleValue {
  const parsed = parseHabitDraft(draft);
  if (!parsed.success) throw new Error(parsed.message);
  return habitScheduleValueSchema.parse(parsed.value.schedule);
}

function scheduleFromDraft(draft: HabitFormDraft, targetPerWeek: number): HabitScheduleValue {
  const bounds = {
    timezone: draft.timezone,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
  };
  if (draft.scheduleKind === "weekdays") {
    return {
      kind: "weekdays",
      weekdays: [...draft.weekdays].sort((left, right) => left - right) as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
      targetPerWeek: null,
      ...bounds,
    };
  }
  if (draft.scheduleKind === "weekly_target") {
    return { kind: "weekly_target", weekdays: null, targetPerWeek, ...bounds };
  }
  return { kind: "daily", weekdays: null, targetPerWeek: null, ...bounds };
}

function formFieldForPath(path: PropertyKey[]): keyof HabitFormDraft {
  const joined = path.map(String).join(".");
  if (joined.includes("title")) return "title";
  if (joined.includes("icon")) return "icon";
  if (joined.includes("unit")) return "unit";
  if (joined.includes("targetValue")) return "targetValue";
  if (joined.includes("weekdays")) return "weekdays";
  if (joined.includes("targetPerWeek")) return "targetPerWeek";
  if (joined.includes("timezone")) return "timezone";
  if (joined.includes("startDate")) return "startDate";
  if (joined.includes("endDate")) return "endDate";
  return "title";
}
