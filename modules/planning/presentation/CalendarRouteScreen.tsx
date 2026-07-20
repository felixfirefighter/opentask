"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import type { CalendarProjection } from "../application/public";
import { CalendarScreen } from "./CalendarScreen";
import { CalendarTaskCreateDialog } from "./CalendarTaskCreateDialog";
import { PlanningLiveRegion } from "./PlanningLiveRegion";
import { resolvePlanningProjectionCondition } from "./planning-projection-condition";
import { midpointLocalDate } from "./schedule-form-policy";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import type { CalendarView, VisibleCalendarRange } from "./planning-screen-model";
import { planningTaskDetailsHref } from "./planning-task-navigation";
import { usePlanningTaskController, type MutablePlanningTask } from "./use-planning-task-controller";
import { toCalendarPlanningModel } from "./planning-view-model";

export function CalendarRouteScreen({
  hasSavedView,
  hourCycle,
  inboxId,
  inboxName,
  initialDate,
  projection,
  view,
  weekStartsOn,
}: Readonly<{
  hasSavedView: boolean;
  hourCycle: "12" | "24";
  inboxId: string;
  inboxName: string;
  initialDate: string;
  projection: CalendarProjection;
  view: CalendarView;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;
  const [creatingTask, setCreatingTask] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const addTaskButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleReturnFocus = useRef<HTMLElement | null>(null);
  const tasks = useMemo(() => projection.events.map(toMutableTask), [projection.events]);
  const controller = usePlanningTaskController(tasks, projection.timeZone, {
    authoritativeSource: projection,
    mutationsDisabled: projection.truncated,
    taskReturnTo: returnTo,
  });
  const condition = resolvePlanningProjectionCondition(controller.condition, projection);
  const model = toCalendarPlanningModel(projection, {
    view,
    hasSavedView,
    initialDate,
    weekStartsOn,
    hourCycle,
    conflictedTaskId: controller.conflictedTaskId,
    taskReturnTo: returnTo,
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

  function closeCreateDialog() {
    setCreatingTask(false);
    window.requestAnimationFrame(() => addTaskButtonRef.current?.focus());
  }

  function editSchedule(taskId: string) {
    scheduleReturnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    controller.editSchedule(taskId);
  }

  function closeSchedule() {
    controller.closeSchedule();
    window.requestAnimationFrame(() => scheduleReturnFocus.current?.focus());
  }

  return (
    <>
      <CalendarScreen
        addTaskRef={addTaskButtonRef}
        model={model}
        condition={condition}
        onAddTask={() => {
          setAnnouncement("");
          setCreatingTask(true);
        }}
        onOpenTask={(taskId) => router.push(planningTaskDetailsHref(taskId, returnTo))}
        onEditSchedule={editSchedule}
        onOccurrenceTransition={(taskId, occurrenceKey, action, projectionId) =>
          controller.taskActions.onOccurrenceTransition?.(taskId, occurrenceKey, action, projectionId)
        }
        onSelectEvent={() => undefined}
        onViewChange={(nextView) => replaceRoute({ view: nextView })}
        onVisibleRangeChange={changeRange}
        onEventMove={controller.saveCalendarChange}
        onEventResize={controller.saveCalendarChange}
        onRetry={controller.retry}
      />
      <CalendarTaskCreateDialog
        inboxId={inboxId}
        inboxName={inboxName}
        initialDate={initialDate}
        open={creatingTask}
        timeZone={projection.timeZone}
        onClose={closeCreateDialog}
        onCreated={() => setAnnouncement("Scheduled task created.")}
      />
      <ScheduleEditorDialog
        localDate={initialDate}
        task={controller.scheduleTask}
        timeZone={projection.timeZone}
        onClose={closeSchedule}
        onSave={async (taskId, schedule) => {
          const saved = await controller.saveSchedule(taskId, schedule, false);
          if (saved === "saved") window.requestAnimationFrame(() => scheduleReturnFocus.current?.focus());
          return saved;
        }}
      />
      <PlanningLiveRegion messages={[announcement, controller.announcement]} />
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
