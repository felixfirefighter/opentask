import { getUserPreferences } from "@/modules/identity";
import { getTasksApplication } from "@/modules/tasks";
import { systemClock } from "@/shared/time/clock";

import { createPlanningProjectionApplication } from "./planning-projection-application";

let projectionApplication: ReturnType<typeof createPlanningProjectionApplication> | undefined;

export function getPlanningProjectionApplication() {
  if (!projectionApplication) {
    const tasks = getTasksApplication();
    projectionApplication = createPlanningProjectionApplication({
      tasks: tasks.planningSource,
      occurrences: tasks.occurrences,
      timeZones: {
        async getSavedTimeZone(actor) {
          return (await getUserPreferences(actor)).timezone;
        },
      },
      clock: systemClock,
    });
  }
  return projectionApplication;
}

export { buildDeterministicPlan } from "./build-deterministic-plan";
export { createPlanningBusyIntervalReader } from "./busy-interval-reader";
export type {
  PlanningBusyIntervalPage,
  PlanningBusyIntervalQuery,
  PlanningBusyIntervalReader,
} from "./busy-interval-reader";
export { createPlanningProjectionApplication } from "./planning-projection-application";
export {
  PLANNING_PROJECTION_MAX_ROWS,
  PLANNING_RANGE_MAX_LOCAL_DAYS,
  planningRangeQuerySchema,
  projectionLimitQuerySchema,
  smartDestinationSchema,
} from "./projection-query-contract";
export {
  agendaProjectionSchema,
  agendaRowSchema,
  calendarEventDtoSchema,
  calendarProjectionSchema,
  eisenhowerProjectionSchema,
  planningTaskRowSchema,
  projectionScheduleSchema,
  todayProjectionSchema,
  upcomingDaySchema,
  upcomingProjectionSchema,
} from "./projection-dto-contract";
export type {
  CanonicalPlanningTaskRow,
  PlanningTaskSourcePage,
  PlanningTaskSourceQuery,
  PlanningTaskSourceReader,
  PlanningTimeZoneReader,
} from "./planning-source-reader";
export type { PlanningRangeQuery, ProjectionLimitQuery, SmartDestination } from "./projection-query-contract";
export type {
  AgendaProjection,
  AgendaRow,
  CalendarEventDto,
  CalendarProjection,
  EisenhowerProjection,
  PlanningTaskRow,
  TodayProjection,
  UpcomingProjection,
} from "./projection-dto-contract";
export type { PlanningProjectionApplication } from "./planning-projection-application";
export type {
  BusyInterval,
  FixedSchedulingCandidate,
  FlexibleSchedulingCandidate,
  ScheduledBlock,
  SchedulingCandidate,
  SchedulingConflict,
  SchedulingConflictCode,
  SchedulingInput,
  SchedulingOverflow,
  SchedulingOverflowReason,
  SchedulingResult,
  SchedulingWorkWindow,
} from "./scheduling-contract";
