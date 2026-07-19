import {
  addLocalDays,
  buildLocalRange,
  dueBoundary,
  instantEpochNanoseconds,
  localDateForInstant,
  scheduleOverlapsLocalRange,
} from "./local-time-policy";
import {
  activeOpenScheduledTasks,
  type ProjectionSourceTask,
  type ScheduledOpenProjectionTask,
} from "./projection-model";
import { compareAllDayTasks, compareByDueBoundary, compareTimedTasks } from "./task-ordering";

export type TodayPolicyInput = Readonly<{
  localDate: string;
  timeZone: string;
  nowAt: string;
}>;

export type TodayPolicyResult = Readonly<{
  overdue: readonly ScheduledOpenProjectionTask[];
  timed: readonly ScheduledOpenProjectionTask[];
  anytime: readonly ScheduledOpenProjectionTask[];
}>;

export function projectToday(
  rows: readonly ProjectionSourceTask[],
  input: TodayPolicyInput,
): TodayPolicyResult {
  if (localDateForInstant(input.nowAt, input.timeZone) !== input.localDate) {
    throw new RangeError("The Today date must match now in the saved timezone.");
  }

  const range = buildLocalRange(input.localDate, addLocalDays(input.localDate, 1), input.timeZone);
  const now = instantEpochNanoseconds(input.nowAt);
  const overdue: ScheduledOpenProjectionTask[] = [];
  const timed: ScheduledOpenProjectionTask[] = [];
  const anytime: ScheduledOpenProjectionTask[] = [];

  for (const task of activeOpenScheduledTasks(rows)) {
    if (dueBoundary(task.schedule, input.timeZone) <= now) {
      overdue.push(task);
      continue;
    }

    if (!scheduleOverlapsLocalRange(task.schedule, range)) {
      continue;
    }

    if (task.schedule.kind === "timed") {
      timed.push(task);
    } else {
      anytime.push(task);
    }
  }

  return {
    overdue: overdue.sort((left, right) => compareByDueBoundary(left, right, input.timeZone)),
    timed: timed.sort(compareTimedTasks),
    anytime: anytime.sort(compareAllDayTasks),
  };
}
