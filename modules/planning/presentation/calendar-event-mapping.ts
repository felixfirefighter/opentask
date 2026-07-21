import type { EventApi, EventInput } from "@fullcalendar/react";

import type { CalendarEventChange, CalendarView, PlanningCalendarEventModel } from "./planning-screen-model";

const calendarViewNames: Readonly<Record<CalendarView, string>> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
  agenda: "listWeek",
};

export function toFullCalendarView(view: CalendarView) {
  return calendarViewNames[view];
}

export function fromFullCalendarView(viewName: string): CalendarView {
  if (viewName === calendarViewNames.week) return "week";
  if (viewName === calendarViewNames.day) return "day";
  if (viewName === calendarViewNames.agenda) return "agenda";
  return "month";
}

export function toFullCalendarEvent(event: PlanningCalendarEventModel, editable: boolean): EventInput {
  return {
    id: event.projectionId,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    url: event.detailsHref,
    interactive: true,
    editable: editable && event.scheduleInteraction.dragEnabled && !event.conflicted,
  };
}

export function toCalendarEventChange(
  event: EventApi,
  original: PlanningCalendarEventModel,
): CalendarEventChange {
  return {
    taskId: original.taskId,
    start: event.startStr || original.start,
    end: event.endStr || original.end,
    allDay: event.allDay,
  };
}

export function calendarEventAccessibleLabel(event: PlanningCalendarEventModel) {
  const conflict = event.conflicted ? ", changed elsewhere" : "";
  const recurrence =
    event.projectionLifecycle === "one_off"
      ? ""
      : `, recurring, ${event.scheduleInteraction.dragDisabledReason ?? "edit future series in task details"}`;
  return `${event.title}, ${event.scheduleLabel}, ${event.statusLabel}, ${event.categoryLabel}${recurrence}${conflict}`;
}
