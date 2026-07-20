"use client";

import { useMemo } from "react";

import type { TodayProjection } from "../application/public";
import { PlanningLiveRegion } from "./PlanningLiveRegion";
import { resolvePlanningProjectionCondition } from "./planning-projection-condition";
import { nextLocalDate } from "./schedule-form-policy";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import { TodayScreen } from "./TodayScreen";
import { usePlanningQuickAdd } from "./use-planning-quick-add";
import { usePlanningProjectionFreshness } from "./use-planning-projection-freshness";
import { usePlanningTaskController } from "./use-planning-task-controller";
import { toTodayPlanningModel } from "./planning-view-model";

export function TodayRouteScreen({
  hourCycle,
  inboxId,
  projection,
}: Readonly<{ hourCycle: "12" | "24"; inboxId: string; projection: TodayProjection }>) {
  const tasks = useMemo(
    () => [...projection.overdue, ...projection.timed, ...projection.anytime],
    [projection],
  );
  const controller = usePlanningTaskController(tasks, projection.timeZone, {
    authoritativeSource: projection,
    mutationsDisabled: projection.truncated,
    taskReturnTo: "/today",
  });
  const freshness = usePlanningProjectionFreshness({
    projectedLocalDate: projection.localDate,
    timeZone: projection.timeZone,
  });
  const model = toTodayPlanningModel(projection, {
    conflictedTaskId: controller.conflictedTaskId,
    hourCycle,
    taskReturnTo: "/today",
  });
  const quickAdd = usePlanningQuickAdd({
    defaultSchedule: {
      kind: "all_day",
      startDate: projection.localDate,
      endDate: nextLocalDate(projection.localDate),
    },
    destinationLabel: "Today · Anytime unless a date is recognized",
    hourCycle,
    inboxId,
    placeholder: "Add a task for today…",
    timeZone: projection.timeZone,
  });

  const condition = resolvePlanningProjectionCondition(
    controller.condition,
    projection,
    freshness.pendingLocalDateLabel
      ? { kind: "date-changed", currentDateLabel: freshness.pendingLocalDateLabel }
      : null,
  );

  return (
    <>
      <TodayScreen
        model={model}
        condition={condition}
        quickAdd={quickAdd.model}
        taskActions={controller.taskActions}
        calendarHref="/calendar"
        upcomingHref="/upcoming"
        onQuickAddChange={quickAdd.change}
        onQuickAddSubmit={(value) => void quickAdd.submit(value)}
        onEditQuickAddToken={quickAdd.editToken}
        onRemoveQuickAddToken={quickAdd.removeToken}
        onRetry={controller.retry}
        onReturnToToday={freshness.refresh}
      />
      <PlanningLiveRegion messages={[freshness.announcement, controller.announcement]} />
      <ScheduleEditorDialog
        localDate={projection.localDate}
        task={quickAdd.editingTask}
        timeZone={projection.timeZone}
        onClose={quickAdd.closeEditor}
        onSave={quickAdd.saveEditedSchedule}
      />
      <ScheduleEditorDialog
        localDate={projection.localDate}
        task={controller.scheduleTask}
        timeZone={projection.timeZone}
        onClose={controller.closeSchedule}
        onSave={controller.saveSchedule}
      />
    </>
  );
}
