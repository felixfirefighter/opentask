"use client";

import { useMemo } from "react";

import type { UpcomingProjection } from "../application/public";
import { PlanningLiveRegion } from "./PlanningLiveRegion";
import { nextLocalDate } from "./schedule-form-policy";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import { UpcomingScreen } from "./UpcomingScreen";
import { usePlanningQuickAdd } from "./use-planning-quick-add";
import { usePlanningProjectionFreshness } from "./use-planning-projection-freshness";
import { usePlanningTaskController } from "./use-planning-task-controller";
import { toUpcomingPlanningModel } from "./planning-view-model";

export function UpcomingRouteScreen({
  hourCycle,
  inboxId,
  projection,
}: Readonly<{ hourCycle: "12" | "24"; inboxId: string; projection: UpcomingProjection }>) {
  const tasks = useMemo(() => projection.days.flatMap((day) => day.items), [projection.days]);
  const controller = usePlanningTaskController(tasks, projection.timeZone, {
    authoritativeSource: projection,
    taskReturnTo: "/upcoming",
  });
  const freshness = usePlanningProjectionFreshness({
    projectedLocalDate: projection.rangeStartDate,
    timeZone: projection.timeZone,
  });
  const nextDate = nextLocalDate(projection.rangeStartDate);
  const quickAdd = usePlanningQuickAdd({
    defaultSchedule: { kind: "all_day", startDate: nextDate, endDate: nextLocalDate(nextDate) },
    destinationLabel: "Upcoming · Next local day unless a date is recognized",
    hourCycle,
    inboxId,
    placeholder: "Add a task for the next local day…",
    timeZone: projection.timeZone,
  });
  const condition =
    controller.condition.kind === "ready" && freshness.pendingLocalDateLabel
      ? ({ kind: "date-changed", currentDateLabel: freshness.pendingLocalDateLabel } as const)
      : controller.condition;

  return (
    <>
      <UpcomingScreen
        model={toUpcomingPlanningModel(projection, {
          conflictedTaskId: controller.conflictedTaskId,
          hourCycle,
          taskReturnTo: "/upcoming",
        })}
        condition={condition}
        quickAdd={quickAdd.model}
        taskActions={controller.taskActions}
        onQuickAddChange={quickAdd.change}
        onQuickAddSubmit={(value) => void quickAdd.submit(value)}
        onEditQuickAddToken={quickAdd.editToken}
        onRemoveQuickAddToken={quickAdd.removeToken}
        onRetry={controller.retry}
      />
      <PlanningLiveRegion messages={[freshness.announcement, controller.announcement]} />
      <ScheduleEditorDialog
        localDate={nextDate}
        task={quickAdd.editingTask}
        timeZone={projection.timeZone}
        onClose={quickAdd.closeEditor}
        onSave={quickAdd.saveEditedSchedule}
      />
      <ScheduleEditorDialog
        localDate={projection.rangeStartDate}
        task={controller.scheduleTask}
        timeZone={projection.timeZone}
        onClose={controller.closeSchedule}
        onSave={controller.saveSchedule}
      />
    </>
  );
}
