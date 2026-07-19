"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import type { UpcomingProjection } from "../application/public";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import { UpcomingScreen } from "./UpcomingScreen";
import { usePlanningTaskController } from "./use-planning-task-controller";
import { toUpcomingPlanningModel } from "./planning-view-model";

export function UpcomingRouteScreen({
  hourCycle,
  projection,
}: Readonly<{ hourCycle: "12" | "24"; projection: UpcomingProjection }>) {
  const router = useRouter();
  const tasks = useMemo(() => projection.days.flatMap((day) => day.items), [projection.days]);
  const controller = usePlanningTaskController(tasks, projection.timeZone);

  return (
    <>
      <UpcomingScreen
        model={toUpcomingPlanningModel(projection, { hourCycle })}
        condition={controller.condition}
        taskActions={controller.taskActions}
        onAddTask={() => router.push("/inbox")}
        onRetry={controller.retry}
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
