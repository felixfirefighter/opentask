"use client";

import { useMemo } from "react";

import type { EisenhowerProjection } from "../application/public";
import { MatrixScreen } from "./MatrixScreen";
import { PlanningLiveRegion } from "./PlanningLiveRegion";
import { localDateForInstant } from "./schedule-form-policy";
import { resolvePlanningProjectionCondition } from "./planning-projection-condition";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import { usePlanningProjectionFreshness } from "./use-planning-projection-freshness";
import { usePlanningTaskController } from "./use-planning-task-controller";
import { toMatrixPlanningModel } from "./planning-view-model";

export function MatrixRouteScreen({
  hourCycle,
  projection,
}: Readonly<{ hourCycle: "12" | "24"; projection: EisenhowerProjection }>) {
  const tasks = useMemo(
    () => [...projection.doNow, ...projection.plan, ...projection.timeSensitive, ...projection.later],
    [projection],
  );
  const destinationByTask = useMemo(
    () =>
      new Map([
        ...projection.doNow.map((task) => [task.id, "Do now"] as const),
        ...projection.plan.map((task) => [task.id, "Plan"] as const),
        ...projection.timeSensitive.map((task) => [task.id, "Time-sensitive"] as const),
        ...projection.later.map((task) => [task.id, "Later"] as const),
      ]),
    [projection],
  );
  const controllerOptions = useMemo(
    () => ({
      authoritativeSource: projection,
      destinationLabelForTask: (taskId: string) => destinationByTask.get(taskId) ?? null,
      mutationsDisabled: projection.truncated,
      taskReturnTo: "/matrix",
    }),
    [destinationByTask, projection],
  );
  const controller = usePlanningTaskController(tasks, projection.timeZone, controllerOptions);
  const freshness = usePlanningProjectionFreshness({
    projectedLocalDate: localDateForInstant(projection.nowAt, projection.timeZone),
    timeZone: projection.timeZone,
  });
  const model = toMatrixPlanningModel(projection, {
    conflictedTaskId: controller.conflictedTaskId,
    hourCycle,
    taskReturnTo: "/matrix",
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
      <MatrixScreen
        model={{ ...model, announcement: controller.announcement }}
        condition={condition}
        taskActions={controller.taskActions}
        onRetry={controller.retry}
      />
      <PlanningLiveRegion messages={[freshness.announcement]} />
      <ScheduleEditorDialog
        localDate={localDateForInstant(projection.nowAt, projection.timeZone)}
        task={controller.scheduleTask}
        timeZone={projection.timeZone}
        onClose={controller.closeSchedule}
        onSave={controller.saveSchedule}
      />
    </>
  );
}
