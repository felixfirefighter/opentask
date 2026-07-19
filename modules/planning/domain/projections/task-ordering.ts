import { compareInstants, compareLocalDates, dueBoundary } from "./local-time-policy";
import type { OpenProjectionTask } from "./projection-model";

export function compareByRankThenId(left: OpenProjectionTask, right: OpenProjectionTask): number {
  return compareText(left.rank, right.rank) || compareText(left.id, right.id);
}

export function compareByDueBoundary(
  left: OpenProjectionTask,
  right: OpenProjectionTask,
  allDayTimeZone: string,
): number {
  const leftDue = left.schedule === null ? null : dueBoundary(left.schedule, allDayTimeZone);
  const rightDue = right.schedule === null ? null : dueBoundary(right.schedule, allDayTimeZone);

  if (leftDue === null && rightDue !== null) return 1;
  if (leftDue !== null && rightDue === null) return -1;
  if (leftDue !== null && rightDue !== null && leftDue !== rightDue) {
    return leftDue < rightDue ? -1 : 1;
  }

  return compareByRankThenId(left, right);
}

export function compareTimedTasks(left: OpenProjectionTask, right: OpenProjectionTask): number {
  if (left.schedule?.kind !== "timed" || right.schedule?.kind !== "timed") {
    return compareByRankThenId(left, right);
  }

  return (
    compareInstants(left.schedule.startAt, right.schedule.startAt) ||
    compareInstants(left.schedule.endAt, right.schedule.endAt) ||
    compareByRankThenId(left, right)
  );
}

export function compareAllDayTasks(left: OpenProjectionTask, right: OpenProjectionTask): number {
  if (left.schedule?.kind !== "all_day" || right.schedule?.kind !== "all_day") {
    return compareByRankThenId(left, right);
  }

  return (
    compareLocalDates(left.schedule.startDate, right.schedule.startDate) ||
    compareLocalDates(left.schedule.endDate, right.schedule.endDate) ||
    compareByRankThenId(left, right)
  );
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
