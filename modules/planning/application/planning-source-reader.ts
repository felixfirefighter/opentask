import type { TaskDto, TaskScheduleDto } from "@/modules/tasks";
import type { AuthenticatedActor } from "@/shared/auth/actor";

export type CanonicalPlanningTaskRow = Readonly<{
  task: TaskDto;
  schedule: TaskScheduleDto | null;
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

export type PlanningTimeZoneReader = Readonly<{
  getSavedTimeZone(actor: AuthenticatedActor): Promise<string>;
}>;
