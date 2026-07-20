import type { TaskScheduleValue } from "../application/contracts";
import type { RecurrenceDefinition, TaskRecurrenceDto } from "../application/contracts/recurrence-contract";

export function recurrenceAttemptMatches({
  attempt,
  attemptedDefinition,
  attemptedSchedule,
  expectedVersion,
  recurrence,
  schedule,
}: Readonly<{
  attempt: "save" | "end" | null;
  attemptedDefinition: RecurrenceDefinition | null;
  attemptedSchedule: TaskScheduleValue | null;
  expectedVersion: number | null;
  recurrence: TaskRecurrenceDto | null;
  schedule: TaskScheduleValue | null;
}>): boolean {
  if (!attempt || expectedVersion === null || !recurrence || recurrence.taskVersion < expectedVersion + 1) {
    return false;
  }
  if (attempt === "end") return recurrence.lifecycle === "ended";
  return (
    attemptedDefinition !== null &&
    attemptedSchedule !== null &&
    schedule !== null &&
    definitionsMatch(attemptedDefinition, recurrence.definition) &&
    schedulesMatch(attemptedSchedule, schedule)
  );
}

export function snapshotTaskSchedule(schedule: TaskScheduleValue): TaskScheduleValue {
  return schedule.kind === "all_day"
    ? { kind: "all_day", startDate: schedule.startDate, endDate: schedule.endDate }
    : {
        kind: "timed",
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        timezone: schedule.timezone,
      };
}

function definitionsMatch(left: RecurrenceDefinition, right: RecurrenceDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function schedulesMatch(left: TaskScheduleValue, right: TaskScheduleValue): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "all_day" && right.kind === "all_day") {
    return left.startDate === right.startDate && left.endDate === right.endDate;
  }
  if (left.kind === "timed" && right.kind === "timed") {
    return left.startAt === right.startAt && left.endAt === right.endAt && left.timezone === right.timezone;
  }
  return false;
}
