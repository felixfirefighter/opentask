import { dueBoundary, instantEpochNanoseconds } from "./local-time-policy";
import { activeOpenTasks, type OpenProjectionTask, type ProjectionSourceTask } from "./projection-model";
import { compareByDueBoundary } from "./task-ordering";

const NEXT_24_HOURS_NANOSECONDS = 24n * 60n * 60n * 1_000_000_000n;

export type EisenhowerPolicyResult = Readonly<{
  doNow: readonly OpenProjectionTask[];
  plan: readonly OpenProjectionTask[];
  timeSensitive: readonly OpenProjectionTask[];
  later: readonly OpenProjectionTask[];
  urgentThrough: bigint;
}>;

export function projectEisenhower(
  rows: readonly ProjectionSourceTask[],
  input: Readonly<{ timeZone: string; nowAt: string }>,
): EisenhowerPolicyResult {
  const now = instantEpochNanoseconds(input.nowAt);
  const urgentThrough = now + NEXT_24_HOURS_NANOSECONDS;
  const doNow: OpenProjectionTask[] = [];
  const plan: OpenProjectionTask[] = [];
  const timeSensitive: OpenProjectionTask[] = [];
  const later: OpenProjectionTask[] = [];

  for (const task of activeOpenTasks(rows)) {
    const important = task.priority === "high";
    const due = task.schedule === null ? null : dueBoundary(task.schedule, input.timeZone);
    const urgent = due !== null && due <= urgentThrough;

    if (important && urgent) doNow.push(task);
    else if (important) plan.push(task);
    else if (urgent) timeSensitive.push(task);
    else later.push(task);
  }

  const compare = (left: OpenProjectionTask, right: OpenProjectionTask) =>
    compareByDueBoundary(left, right, input.timeZone);

  return {
    doNow: doNow.sort(compare),
    plan: plan.sort(compare),
    timeSensitive: timeSensitive.sort(compare),
    later: later.sort(compare),
    urgentThrough,
  };
}
