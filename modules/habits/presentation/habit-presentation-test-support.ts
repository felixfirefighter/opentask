import type {
  HabitDayProjection,
  HabitDetailDto,
  HabitLogDto,
  HabitMonthProjection,
  HabitOverview,
  HabitTodayRow,
} from "../application/contracts";

export const TEST_HABIT_ID = "3db2d92f-4a43-4e9d-a772-29a13fa59d93";
export const TEST_LOG_ID = "58c0417d-b5dd-47e1-a71d-8a07903898c8";
export const TEST_NOW = "2026-07-20T01:00:00.000Z";
export const TEST_LOCAL_DATE = "2026-07-20";

export function habitDetail(overrides: Partial<HabitDetailDto["habit"]> = {}): HabitDetailDto {
  return {
    habit: {
      id: TEST_HABIT_ID,
      title: "Morning walk",
      icon: "☀️",
      colorToken: "mint",
      goal: { goalKind: "boolean", targetValue: null, unit: null },
      version: 1,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      archivedAt: null,
      ...overrides,
    },
    schedule: {
      habitId: TEST_HABIT_ID,
      schedule: {
        kind: "daily",
        weekdays: null,
        targetPerWeek: null,
        timezone: "Asia/Singapore",
        startDate: "2026-07-01",
        endDate: null,
      },
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
  };
}

export function habitLog(overrides: Partial<HabitLogDto> = {}): HabitLogDto {
  return {
    id: TEST_LOG_ID,
    habitId: TEST_HABIT_ID,
    localDate: TEST_LOCAL_DATE,
    state: "completed",
    quantity: null,
    note: null,
    successful: true,
    version: 1,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  };
}

export function habitDay(localDate: string, overrides: Partial<HabitDayProjection> = {}): HabitDayProjection {
  return {
    localDate,
    scheduled: true,
    status: "open",
    successful: false,
    log: null,
    ...overrides,
  };
}

export function sevenHabitDays(): HabitDayProjection[] {
  return [
    habitDay("2026-07-14", { status: "successful", successful: true }),
    habitDay("2026-07-15", { status: "successful", successful: true }),
    habitDay("2026-07-16", { status: "skipped" }),
    habitDay("2026-07-17", { status: "successful", successful: true }),
    habitDay("2026-07-18", { status: "not_scheduled", scheduled: false }),
    habitDay("2026-07-19", { status: "successful", successful: true }),
    habitDay(TEST_LOCAL_DATE),
  ];
}

export function habitOverview(overrides: Partial<HabitOverview> = {}): HabitOverview {
  return {
    detail: habitDetail(),
    localDate: TEST_LOCAL_DATE,
    today: habitDay(TEST_LOCAL_DATE),
    streak: {
      habitId: TEST_HABIT_ID,
      cadence: "day",
      current: 2,
      best: 5,
      evaluatedThrough: TEST_LOCAL_DATE,
    },
    sevenDay: sevenHabitDays(),
    weeklyProgress: null,
    ...overrides,
  };
}

export function habitTodayRow(overrides: Partial<HabitTodayRow> = {}): HabitTodayRow {
  const overview = habitOverview();
  return {
    detail: overview.detail,
    localDate: overview.localDate,
    day: overview.today,
    streak: overview.streak,
    sevenDay: overview.sevenDay,
    weeklyProgress: overview.weeklyProgress,
    requiresAction: true,
    ...overrides,
  };
}

export function habitMonth(): HabitMonthProjection {
  return {
    habitId: TEST_HABIT_ID,
    yearMonth: "2026-07",
    days: Array.from({ length: 31 }, (_, index) => {
      const localDate = `2026-07-${String(index + 1).padStart(2, "0")}`;
      if (localDate === TEST_LOCAL_DATE) {
        return habitDay(localDate, {
          status: "successful",
          successful: true,
          log: habitLog(),
        });
      }
      return habitDay(localDate, {
        status: localDate > TEST_LOCAL_DATE ? "future" : "open",
      });
    }),
  };
}
