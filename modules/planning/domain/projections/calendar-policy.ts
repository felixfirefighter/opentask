import {
  agendaGroupDate,
  compareLocalDates,
  scheduleOverlapsLocalRange,
  type LocalRange,
} from "./local-time-policy";
import {
  activeOpenScheduledTasks,
  type ProjectionSourceTask,
  type ScheduledOpenProjectionTask,
} from "./projection-model";
import { compareAllDayTasks, compareTimedTasks } from "./task-ordering";

export type AgendaProjectionRow = Readonly<{
  groupDate: string;
  task: ScheduledOpenProjectionTask;
}>;

export function projectCalendarTasks(
  rows: readonly ProjectionSourceTask[],
  range: LocalRange,
): readonly ScheduledOpenProjectionTask[] {
  return activeOpenScheduledTasks(rows)
    .filter((task) => scheduleOverlapsLocalRange(task.schedule, range))
    .sort(compareCalendarTasks);
}

export function projectAgendaTasks(
  rows: readonly ProjectionSourceTask[],
  range: LocalRange,
  viewerTimeZone: string,
): readonly AgendaProjectionRow[] {
  return projectCalendarTasks(rows, range)
    .map((task) => ({
      groupDate: agendaGroupDate(task.schedule, range.startDate, viewerTimeZone),
      task,
    }))
    .sort((left, right) => {
      return (
        compareLocalDates(left.groupDate, right.groupDate) || compareCalendarTasks(left.task, right.task)
      );
    });
}

function compareCalendarTasks(left: ScheduledOpenProjectionTask, right: ScheduledOpenProjectionTask): number {
  if (left.schedule.kind === "all_day" && right.schedule.kind === "timed") return -1;
  if (left.schedule.kind === "timed" && right.schedule.kind === "all_day") return 1;
  return left.schedule.kind === "all_day" ? compareAllDayTasks(left, right) : compareTimedTasks(left, right);
}
