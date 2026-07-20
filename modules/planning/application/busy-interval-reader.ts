import type { AuthenticatedActor } from "@/shared/auth/actor";

import type { BusyInterval } from "./scheduling-contract";
import type {
  PlanningOccurrenceRangeQuery,
  PlanningOccurrenceSourcePage,
  PlanningOccurrenceSourceReader,
} from "./planning-source-reader";

export type PlanningBusyIntervalQuery = PlanningOccurrenceRangeQuery;

export type PlanningBusyIntervalPage = Readonly<{
  items: readonly BusyInterval[];
  truncation: PlanningOccurrenceSourcePage["truncation"];
}>;

export type PlanningBusyIntervalReader = Readonly<{
  readBusyIntervals(
    actor: AuthenticatedActor,
    query: PlanningBusyIntervalQuery,
  ): Promise<PlanningBusyIntervalPage>;
}>;

/**
 * Projects the tasks module's bounded occurrence source into content-free planner context.
 * Truncation is deliberately preserved so callers can fail closed instead of scheduling
 * against a partial calendar.
 */
export function createPlanningBusyIntervalReader(
  occurrences: PlanningOccurrenceSourceReader,
): PlanningBusyIntervalReader {
  return {
    async readBusyIntervals(actor, query) {
      const page = await occurrences.readBoundedOccurrences(actor, query);
      return {
        items: page.items.flatMap((item) => {
          if (item.task.status !== "open" || item.task.deletedAt !== null) return [];
          const schedule =
            item.projectionKind === "one_off"
              ? item.schedule
              : item.occurrence.occurrenceState === "open"
                ? item.occurrence.schedule
                : null;
          return schedule?.kind === "timed" ? [{ startAt: schedule.startAt, endAt: schedule.endAt }] : [];
        }),
        truncation: page.truncation,
      };
    },
  };
}
