import type { TaskDto, TaskScheduleDto, TaskScheduleValue } from "@/modules/tasks";
import type { AuthenticatedActor } from "@/shared/auth/actor";

export type CanonicalPlanningTaskRow = Readonly<{
  task: TaskDto;
  schedule: TaskScheduleDto | null;
  recurrenceRoot: boolean;
}>;

export type PlanningTaskSourcePage = Readonly<{
  items: readonly CanonicalPlanningTaskRow[];
  truncated: boolean;
}>;

export type PlanningTaskSourceQuery =
  | Readonly<{
      kind: "scheduled_through";
      exclusiveEndDate: string;
      exclusiveEndAt: string;
      limit: number;
    }>
  | Readonly<{
      kind: "scheduled_range";
      rangeStartDate: string;
      rangeEndDate: string;
      rangeStartAt: string;
      rangeEndAt: string;
      limit: number;
    }>
  | Readonly<{
      kind: "all_open";
      limit: number;
    }>;

export type PlanningTaskSourceReader = Readonly<{
  readOpenTasks(actor: AuthenticatedActor, query: PlanningTaskSourceQuery): Promise<PlanningTaskSourcePage>;
}>;

export type PlanningOccurrenceState = "open" | "completed" | "skipped";

export type PlanningBoundedOccurrenceProjection =
  | Readonly<{
      projectionKind: "one_off";
      task: TaskDto;
      schedule: TaskScheduleDto;
    }>
  | Readonly<{
      projectionKind: "recurring";
      task: TaskDto;
      occurrence: Readonly<{
        taskId: string;
        taskVersion: number;
        occurrenceKey: string;
        occurrenceState: PlanningOccurrenceState;
        transitionEligible: boolean;
        schedule: TaskScheduleValue;
      }>;
    }>;

export type PlanningOccurrenceTruncationReason =
  | "source_limit"
  | "event_source_limit"
  | "series_candidate_limit"
  | "request_candidate_limit"
  | "output_limit";

export type PlanningOccurrenceSourcePage = Readonly<{
  items: readonly PlanningBoundedOccurrenceProjection[];
  truncation: Readonly<{
    truncated: boolean;
    reasons: readonly PlanningOccurrenceTruncationReason[];
    recurrenceRowsEvaluated: number;
    occurrenceEventsEvaluated: number;
    candidateEvaluations: number;
  }>;
}>;

export type PlanningOccurrenceRangeQuery = Readonly<{
  rangeStartDate: string;
  rangeEndDate: string;
  rangeStartAt: string;
  rangeEndAt: string;
  limit: number;
}>;

export type PlanningCompositeSourceRequest = Readonly<{
  timeZone: string;
  taskQuery: PlanningTaskSourceQuery;
  occurrenceQueries:
    [PlanningOccurrenceRangeQuery] | [PlanningOccurrenceRangeQuery, PlanningOccurrenceRangeQuery];
}>;

export type PlanningCompositeSourceResult = Readonly<{
  taskPage: PlanningTaskSourcePage;
  occurrencePages: readonly PlanningOccurrenceSourcePage[];
}>;

/** Narrow structural boundary over the tasks module's repeatable-read planning snapshot. */
export type PlanningCompositeSourceReader = Readonly<{
  readPlanningSnapshot(
    actor: AuthenticatedActor,
    request: PlanningCompositeSourceRequest,
  ): Promise<PlanningCompositeSourceResult>;
}>;

/** Narrow structural boundary over the tasks module's bounded occurrence reader. */
export type PlanningOccurrenceSourceReader = Readonly<{
  readBoundedOccurrences(
    actor: AuthenticatedActor,
    query: PlanningOccurrenceRangeQuery,
    projectionTimeZone?: string,
  ): Promise<PlanningOccurrenceSourcePage>;
}>;

export type PlanningTimeZoneReader = Readonly<{
  getSavedTimeZone(actor: AuthenticatedActor): Promise<string>;
}>;
