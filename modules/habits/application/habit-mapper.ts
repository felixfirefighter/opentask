import {
  habitDetailDtoSchema,
  habitDtoSchema,
  habitLogDtoSchema,
  habitScheduleDtoSchema,
  type HabitDetailDto,
  type HabitDto,
  type HabitGoal,
  type HabitLogDto,
  type HabitScheduleDto,
  type HabitScheduleValue,
} from "./contracts";
import { isSuccessfulHabitLog, type HabitDayLog } from "../domain/habit-day-policy";
import type { HabitGoal as DomainHabitGoal } from "../domain/habit-goal-policy";
import type { StoredHabitLog } from "../infrastructure/habit-log-repository";
import type { StoredHabit } from "../infrastructure/habit-repository";
import type { HabitScheduleWrite, StoredHabitSchedule } from "../infrastructure/habit-schedule-repository";

export function mapHabit(row: StoredHabit): HabitDto {
  return habitDtoSchema.parse({
    id: row.id,
    title: row.title,
    icon: row.icon,
    colorToken: row.colorToken,
    goal: storedHabitGoal(row),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  });
}

export function mapHabitSchedule(row: StoredHabitSchedule): HabitScheduleDto {
  return habitScheduleDtoSchema.parse({
    habitId: row.habitId,
    schedule: storedHabitSchedule(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapHabitDetail(habit: StoredHabit, schedule: StoredHabitSchedule): HabitDetailDto {
  return habitDetailDtoSchema.parse({ habit: mapHabit(habit), schedule: mapHabitSchedule(schedule) });
}

export function mapHabitLog(row: StoredHabitLog, goal: HabitGoal): HabitLogDto {
  const domainGoal = toDomainGoal(goal);
  const domainLog = storedHabitLog(row);
  return habitLogDtoSchema.parse({
    id: row.id,
    habitId: row.habitId,
    localDate: row.localDate,
    state: row.state,
    quantity: row.quantity,
    note: row.note,
    successful: isSuccessfulHabitLog(domainGoal, domainLog),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function storedHabitGoal(row: StoredHabit): HabitGoal {
  if (row.goalKind === "boolean") {
    if (row.targetValue !== null || row.unit !== null) throw invalidStoredHabit();
    return { goalKind: "boolean", targetValue: null, unit: null };
  }
  if (row.goalKind === "quantity" && row.targetValue !== null && row.unit !== null) {
    return { goalKind: "quantity", targetValue: row.targetValue, unit: row.unit };
  }
  throw invalidStoredHabit();
}

export function storedHabitSchedule(row: StoredHabitSchedule): HabitScheduleValue {
  const common = { timezone: row.timezone, startDate: row.startDate, endDate: row.endDate };
  if (row.kind === "daily" && row.weekdays === null && row.targetPerWeek === null) {
    return { kind: "daily", weekdays: null, targetPerWeek: null, ...common };
  }
  if (row.kind === "weekdays" && row.weekdays !== null && row.targetPerWeek === null) {
    return {
      kind: "weekdays",
      weekdays: row.weekdays as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
      targetPerWeek: null,
      ...common,
    };
  }
  if (row.kind === "weekly_target" && row.weekdays === null && row.targetPerWeek !== null) {
    return { kind: "weekly_target", weekdays: null, targetPerWeek: row.targetPerWeek, ...common };
  }
  throw new Error("A stored habit schedule has an invalid discriminant shape.");
}

export function toScheduleWrite(schedule: HabitScheduleValue): HabitScheduleWrite {
  return schedule.kind === "weekdays" ? { ...schedule, weekdays: [...schedule.weekdays] } : schedule;
}

export function toDomainGoal(goal: HabitGoal): DomainHabitGoal {
  return goal;
}

export function storedHabitLog(row: StoredHabitLog): HabitDayLog {
  if (row.state !== "completed" && row.state !== "skipped" && row.state !== "unachieved") {
    throw new Error("A stored habit log has an invalid state.");
  }
  return {
    localDate: row.localDate,
    state: row.state,
    quantity: row.quantity,
    note: row.note,
  };
}

function invalidStoredHabit() {
  return new Error("A stored habit has an invalid goal shape.");
}
