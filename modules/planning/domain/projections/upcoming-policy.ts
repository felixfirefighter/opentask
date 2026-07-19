import {
  addLocalDays,
  agendaGroupDate,
  countLocalDays,
  dueBoundary,
  instantEpochNanoseconds,
  scheduleOverlapsLocalRange,
  type LocalRange,
} from "./local-time-policy";
import {
  activeOpenScheduledTasks,
  type ProjectionSourceTask,
  type ScheduledOpenProjectionTask,
} from "./projection-model";
import { compareAllDayTasks, compareTimedTasks } from "./task-ordering";

export type UpcomingDay = Readonly<{
  localDate: string;
  tasks: readonly ScheduledOpenProjectionTask[];
}>;

export function projectUpcoming(
  rows: readonly ProjectionSourceTask[],
  input: Readonly<{ range: LocalRange; timeZone: string; nowAt: string }>,
): readonly UpcomingDay[] {
  if (countLocalDays(input.range.startDate, input.range.endDate) !== 7) {
    throw new RangeError("Upcoming must cover exactly seven local days.");
  }

  const dates = Array.from({ length: 7 }, (_, index) => addLocalDays(input.range.startDate, index));
  const grouped = new Map(dates.map((localDate) => [localDate, [] as ScheduledOpenProjectionTask[]]));
  const now = instantEpochNanoseconds(input.nowAt);

  for (const task of activeOpenScheduledTasks(rows)) {
    if (
      dueBoundary(task.schedule, input.timeZone) <= now ||
      !scheduleOverlapsLocalRange(task.schedule, input.range)
    ) {
      continue;
    }

    const localDate = agendaGroupDate(task.schedule, input.range.startDate, input.timeZone);
    grouped.get(localDate)?.push(task);
  }

  return dates.map((localDate) => ({
    localDate,
    tasks: (grouped.get(localDate) ?? []).sort(compareUpcomingTasks),
  }));
}

function compareUpcomingTasks(left: ScheduledOpenProjectionTask, right: ScheduledOpenProjectionTask): number {
  if (left.schedule.kind === "all_day" && right.schedule.kind === "timed") return -1;
  if (left.schedule.kind === "timed" && right.schedule.kind === "all_day") return 1;
  return left.schedule.kind === "all_day" ? compareAllDayTasks(left, right) : compareTimedTasks(left, right);
}
