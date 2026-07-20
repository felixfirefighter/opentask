import type { CalendarProjection } from "../application/public";

import {
  canApplyPlanningOccurrenceResultOptimistically,
  type PlanningOccurrenceMutationResult,
} from "./planning-client-api";

export type CalendarOccurrenceWrites = Readonly<
  Record<
    string,
    Readonly<{
      occurrenceState: PlanningOccurrenceMutationResult["occurrenceState"];
      taskId: string;
      taskVersion: number;
    }>
  >
>;

export function recordCalendarOccurrenceWrite(
  current: CalendarOccurrenceWrites,
  result: PlanningOccurrenceMutationResult,
): CalendarOccurrenceWrites {
  if (!canApplyPlanningOccurrenceResultOptimistically(result)) return current;

  return {
    ...current,
    [result.occurrenceKey]: {
      occurrenceState: result.occurrenceState,
      taskId: result.task.id,
      taskVersion: result.task.version,
    },
  };
}

export function applyCalendarOccurrenceWrites(
  projection: CalendarProjection,
  writes: CalendarOccurrenceWrites,
): CalendarProjection {
  const recorded = Object.entries(writes);
  if (recorded.length === 0) return projection;

  const latestTaskVersions = new Map<string, number>();
  for (const [, write] of recorded) {
    latestTaskVersions.set(
      write.taskId,
      Math.max(latestTaskVersions.get(write.taskId) ?? 0, write.taskVersion),
    );
  }

  return {
    ...projection,
    events: projection.events.map((event) => {
      const exactWrite = event.occurrenceKey ? writes[event.occurrenceKey] : undefined;
      const taskVersion = Math.max(event.version, latestTaskVersions.get(event.taskId) ?? 0);
      return {
        ...event,
        version: taskVersion,
        ...(exactWrite && exactWrite.taskId === event.taskId && exactWrite.taskVersion >= event.version
          ? { occurrenceState: exactWrite.occurrenceState }
          : {}),
      };
    }),
  };
}
