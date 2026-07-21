import {
  createHabitRequestSchema,
  editHabitDayRequestSchema,
  habitDetailDtoSchema,
  habitHistoryProjectionSchema,
  habitHistoryQuerySchema,
  habitDefinitionPageSchema,
  habitLifecyclePageQuerySchema,
  habitLifecycleRequestSchema,
  habitLogDtoSchema,
  habitMonthProjectionSchema,
  habitMonthQuerySchema,
  habitOverviewPageSchema,
  habitOverviewSchema,
  habitPageQuerySchema,
  habitStreakProjectionSchema,
  habitTodayProjectionSchema,
  recordHabitDayRequestSchema,
  recordHabitDayResultSchema,
  setHabitScheduleRequestSchema,
  undoHabitDayRequestSchema,
  updateHabitRequestSchema,
  type CreateHabitRequest,
  type EditHabitDayRequest,
  type HabitHistoryQuery,
  type HabitLifecyclePageQuery,
  type HabitMonthQuery,
  type HabitPageQuery,
  type HabitScheduleValue,
  type RecordHabitDayRequest,
  type UndoHabitDayRequest,
  type UpdateHabitRequest,
} from "../../application/contracts";
import { habitJsonMutation, habitQueryPath, requestHabitJson } from "./habit-api-request";

export function listHabits(query: HabitLifecyclePageQuery) {
  const input = habitLifecyclePageQuerySchema.parse(query);
  return requestHabitJson(habitQueryPath("/api/v1/habits", input), habitDefinitionPageSchema);
}

export function listHabitOverviews(query: HabitLifecyclePageQuery) {
  const input = habitLifecyclePageQuerySchema.parse(query);
  return requestHabitJson(habitQueryPath("/api/v1/habits/overviews", input), habitOverviewPageSchema);
}

export function getHabit(habitId: string) {
  return requestHabitJson(`/api/v1/habits/${habitId}`, habitDetailDtoSchema);
}

export function getHabitOverview(habitId: string) {
  return requestHabitJson(`/api/v1/habits/${habitId}/overview`, habitOverviewSchema);
}

export function getHabitToday(query: HabitPageQuery) {
  const input = habitPageQuerySchema.parse(query);
  return requestHabitJson(habitQueryPath("/api/v1/habits/today", input), habitTodayProjectionSchema);
}

export function getHabitHistory(habitId: string, query: HabitHistoryQuery) {
  const input = habitHistoryQuerySchema.parse(query);
  return requestHabitJson(
    habitQueryPath(`/api/v1/habits/${habitId}/history`, input),
    habitHistoryProjectionSchema,
  );
}

export function getHabitStreaks(habitId: string) {
  return requestHabitJson(`/api/v1/habits/${habitId}/streaks`, habitStreakProjectionSchema);
}

export function getHabitMonth(habitId: string, query: HabitMonthQuery) {
  const input = habitMonthQuerySchema.parse(query);
  return requestHabitJson(
    habitQueryPath(`/api/v1/habits/${habitId}/month`, input),
    habitMonthProjectionSchema,
  );
}

export function createHabit(resourceId: string, input: CreateHabitRequest) {
  return requestHabitJson(
    "/api/v1/habits",
    habitDetailDtoSchema,
    habitJsonMutation("POST", createHabitRequestSchema.parse(input), { "idempotency-key": resourceId }),
  );
}

export function updateHabit(habitId: string, input: UpdateHabitRequest) {
  return requestHabitJson(
    `/api/v1/habits/${habitId}`,
    habitDetailDtoSchema,
    habitJsonMutation("PATCH", updateHabitRequestSchema.parse(input)),
  );
}

export function setHabitSchedule(habitId: string, expectedVersion: number, schedule: HabitScheduleValue) {
  return requestHabitJson(
    `/api/v1/habits/${habitId}/schedule`,
    habitDetailDtoSchema,
    habitJsonMutation("PATCH", setHabitScheduleRequestSchema.parse({ expectedVersion, schedule })),
  );
}

export function archiveHabit(habitId: string, expectedVersion: number) {
  return habitLifecycleMutation(habitId, "archive", expectedVersion);
}

export function restoreHabit(habitId: string, expectedVersion: number) {
  return habitLifecycleMutation(habitId, "restore", expectedVersion);
}

export function recordHabitDay(habitId: string, resourceId: string, input: RecordHabitDayRequest) {
  return requestHabitJson(
    `/api/v1/habits/${habitId}/logs`,
    recordHabitDayResultSchema,
    habitJsonMutation("POST", recordHabitDayRequestSchema.parse(input), {
      "idempotency-key": resourceId,
    }),
  );
}

export function editHabitDay(habitId: string, localDate: string, input: EditHabitDayRequest) {
  return requestHabitJson(
    `/api/v1/habits/${habitId}/logs/${localDate}`,
    habitLogDtoSchema,
    habitJsonMutation("PATCH", editHabitDayRequestSchema.parse(input)),
  );
}

export function undoHabitDay(habitId: string, localDate: string, input: UndoHabitDayRequest) {
  return requestHabitJson(
    `/api/v1/habits/${habitId}/logs/${localDate}/undo`,
    habitLogDtoSchema,
    habitJsonMutation("POST", undoHabitDayRequestSchema.parse(input)),
  );
}

function habitLifecycleMutation(habitId: string, action: "archive" | "restore", expectedVersion: number) {
  return requestHabitJson(
    `/api/v1/habits/${habitId}/${action}`,
    habitDetailDtoSchema,
    habitJsonMutation("POST", habitLifecycleRequestSchema.parse({ expectedVersion })),
  );
}
