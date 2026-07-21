import { Temporal } from "temporal-polyfill";

import type { DemoHabitDataset } from "../infrastructure/demo-habit-repository";

export const DEMO_HABIT_TIMEZONE = "UTC";

const ids = {
  daily: "71000000-0000-4000-8000-000000000001",
  numeric: "71000000-0000-4000-8000-000000000002",
  weekly: "71000000-0000-4000-8000-000000000003",
  archived: "71000000-0000-4000-8000-000000000004",
  dailyLog1: "72000000-0000-4000-8000-000000000001",
  dailyLog2: "72000000-0000-4000-8000-000000000002",
  numericLog: "72000000-0000-4000-8000-000000000003",
  weeklyLog1: "72000000-0000-4000-8000-000000000004",
  weeklyLog2: "72000000-0000-4000-8000-000000000005",
  archivedLog: "72000000-0000-4000-8000-000000000006",
} as const;

export function buildDemoHabitFixture(resetAt: Date): DemoHabitDataset {
  const today = Temporal.Instant.from(resetAt.toISOString())
    .toZonedDateTimeISO(DEMO_HABIT_TIMEZONE)
    .toPlainDate();
  const startDate = today.subtract({ days: 30 }).toString();
  const dailyDates = [today.subtract({ days: 2 }), today.subtract({ days: 1 })];
  const weekStart = today.subtract({ days: today.dayOfWeek - 1 });
  const weeklyDates = Array.from({ length: Math.min(today.dayOfWeek, 2) }, (_, offset) =>
    weekStart.add({ days: offset }),
  );

  return {
    resetAt,
    habits: [
      habit(ids.daily, "Morning reset", "☀️", "amber", "boolean"),
      habit(ids.numeric, "Drink water", "💧", "sky", "quantity", 8, "glasses"),
      habit(ids.weekly, "Move with intention", "🌿", "mint", "boolean"),
      {
        ...habit(ids.archived, "Read before bed", "📖", "violet", "boolean"),
        version: 2,
        archivedAt: resetAt,
      },
    ],
    schedules: [
      schedule(ids.daily, { kind: "daily", weekdays: null, targetPerWeek: null }, startDate),
      schedule(
        ids.numeric,
        {
          kind: "weekdays",
          weekdays: [1, 3, 5],
          targetPerWeek: null,
        },
        startDate,
      ),
      schedule(ids.weekly, { kind: "weekly_target", weekdays: null, targetPerWeek: 3 }, startDate),
      schedule(ids.archived, { kind: "daily", weekdays: null, targetPerWeek: null }, startDate),
    ],
    logs: [
      completed(ids.dailyLog1, ids.daily, dailyDates[0]!.toString(), null, "Started calmly."),
      completed(ids.dailyLog2, ids.daily, dailyDates[1]!.toString(), null, null),
      completed(ids.numericLog, ids.numeric, today.subtract({ days: 1 }).toString(), 8, null),
      ...weeklyDates.map((date, index) =>
        completed(index === 0 ? ids.weeklyLog1 : ids.weeklyLog2, ids.weekly, date.toString(), null, null),
      ),
      completed(ids.archivedLog, ids.archived, today.subtract({ days: 4 }).toString(), null, null),
    ],
  };
}

function habit(
  id: string,
  title: string,
  icon: string,
  colorToken: "coral" | "amber" | "mint" | "sky" | "violet" | "slate",
  goalKind: "boolean" | "quantity",
  targetValue: number | null = null,
  unit: string | null = null,
) {
  return {
    id,
    definition: { title, icon, colorToken, goalKind, targetValue, unit },
    version: 1,
    archivedAt: null,
  } as const;
}

function schedule(
  habitId: string,
  discriminant:
    | { kind: "daily"; weekdays: null; targetPerWeek: null }
    | { kind: "weekdays"; weekdays: number[]; targetPerWeek: null }
    | { kind: "weekly_target"; weekdays: null; targetPerWeek: number },
  startDate: string,
) {
  return {
    habitId,
    schedule: {
      ...discriminant,
      timezone: DEMO_HABIT_TIMEZONE,
      startDate,
      endDate: null,
    },
  } as const;
}

function completed(
  id: string,
  habitId: string,
  localDate: string,
  quantity: number | null,
  note: string | null,
) {
  return { id, habitId, localDate, value: { state: "completed", quantity, note } } as const;
}
