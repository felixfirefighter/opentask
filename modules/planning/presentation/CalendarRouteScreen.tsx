"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { CalendarProjection } from "../application/public";
import { CalendarScreen } from "./CalendarScreen";
import { midpointLocalDate } from "./schedule-form-policy";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import type { CalendarView, VisibleCalendarRange } from "./planning-screen-model";
import { usePlanningTaskController, type MutablePlanningTask } from "./use-planning-task-controller";
import { toCalendarPlanningModel } from "./planning-view-model";

export function CalendarRouteScreen({
  hasSavedView,
  hourCycle,
  initialDate,
  projection,
  view,
  weekStartsOn,
}: Readonly<{
  hasSavedView: boolean;
  hourCycle: "12" | "24";
  initialDate: string;
  projection: CalendarProjection;
  view: CalendarView;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tasks = useMemo(() => projection.events.map(toMutableTask), [projection.events]);
  const controller = usePlanningTaskController(tasks, projection.timeZone);
  const model = toCalendarPlanningModel(projection, {
    view,
    hasSavedView,
    initialDate,
    weekStartsOn,
    hourCycle,
  });

  function replaceRoute(patch: Readonly<Record<string, string>>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) next.set(key, value);
    const href = `${pathname}?${next.toString()}`;
    if (href !== `${pathname}?${searchParams.toString()}`) router.replace(href, { scroll: false });
  }

  function changeRange(range: VisibleCalendarRange) {
    const start = range.start.slice(0, 10);
    const end = range.end.slice(0, 10);
    if (start === projection.rangeStartDate && end === projection.rangeEndDate && range.view === view) return;
    replaceRoute({
      view: range.view,
      rangeStartDate: start,
      rangeEndDate: end,
      date: midpointLocalDate(start, end),
    });
  }

  return (
    <>
      <CalendarScreen
        model={model}
        condition={controller.condition}
        onAddTask={() => router.push("/inbox")}
        onOpenTask={(taskId) => router.push(`/tasks/${taskId}`)}
        onEditSchedule={controller.editSchedule}
        onSelectEvent={() => undefined}
        onViewChange={(nextView) => replaceRoute({ view: nextView })}
        onVisibleRangeChange={changeRange}
        onEventMove={controller.saveCalendarChange}
        onEventResize={controller.saveCalendarChange}
        onRetry={controller.retry}
      />
      <ScheduleEditorDialog
        localDate={initialDate}
        task={controller.scheduleTask}
        timeZone={projection.timeZone}
        onClose={controller.closeSchedule}
        onSave={controller.saveSchedule}
      />
    </>
  );
}

function toMutableTask(event: CalendarProjection["events"][number]): MutablePlanningTask {
  return {
    id: event.taskId,
    title: event.title,
    version: event.version,
    schedule:
      event.kind === "all_day"
        ? { kind: event.kind, startDate: event.startDate, endDate: event.endDate }
        : {
            kind: event.kind,
            startAt: event.startAt,
            endAt: event.endAt,
            timezone: event.timezone,
          },
  };
}
