"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import type { EisenhowerProjection } from "../application/public";
import { MatrixScreen } from "./MatrixScreen";
import { localDateForInstant } from "./schedule-form-policy";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import { usePlanningTaskController } from "./use-planning-task-controller";
import { toMatrixPlanningModel } from "./planning-view-model";

export function MatrixRouteScreen({
  hourCycle,
  projection,
}: Readonly<{ hourCycle: "12" | "24"; projection: EisenhowerProjection }>) {
  const router = useRouter();
  const tasks = useMemo(
    () => [...projection.doNow, ...projection.plan, ...projection.timeSensitive, ...projection.later],
    [projection],
  );
  const controller = usePlanningTaskController(tasks, projection.timeZone);

  return (
    <>
      <MatrixScreen
        model={toMatrixPlanningModel(projection, { hourCycle })}
        condition={controller.condition}
        taskActions={controller.taskActions}
        onAddTask={() => router.push("/inbox")}
        onRetry={controller.retry}
      />
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
