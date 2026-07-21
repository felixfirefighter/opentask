"use client";

import FullCalendar, {
  type CalendarRef,
  type DatesSetInfo,
  type EventDisplayInfo,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import "@fullcalendar/react/skeleton.css";

import {
  calendarEventAccessibleLabel,
  fromFullCalendarView,
  toCalendarEventChange,
  toFullCalendarEvent,
  toFullCalendarView,
} from "./calendar-event-mapping";
import { CalendarEventContent } from "./CalendarEventContent";
import type {
  CalendarChangeResult,
  CalendarPlanningModel,
  CalendarView,
  PlanningTaskOpenOptions,
  VisibleCalendarRange,
} from "./planning-screen-model";
import eventStyles from "./CalendarEvent.module.css";
import styles from "./CalendarScreen.module.css";

const plugins = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin];

type FullCalendarViewProps = Readonly<{
  model: CalendarPlanningModel;
  view: CalendarView;
  navigation: Readonly<{
    revision: number;
    direction: "previous" | "today" | "next";
  }>;
  readOnly: boolean;
  onOpenTask: (taskId: string, options?: PlanningTaskOpenOptions) => void;
  onSelectEvent: (eventId: string) => void;
  onVisibleRangeChange: (range: VisibleCalendarRange) => void;
  onEventMove: (change: ReturnType<typeof toCalendarEventChange>) => Promise<CalendarChangeResult>;
  onEventResize: (change: ReturnType<typeof toCalendarEventChange>) => Promise<CalendarChangeResult>;
}>;

export function FullCalendarView({
  model,
  navigation,
  onEventMove,
  onEventResize,
  onOpenTask,
  onSelectEvent,
  onVisibleRangeChange,
  readOnly,
  view,
}: FullCalendarViewProps) {
  const hydrationReady = useSyncExternalStore(subscribeToHydration, readHydrated, readServerHydrated);
  const calendarRef = useRef<CalendarRef>(null);
  const previousInitialDate = useRef(model.initialDate);
  const [interactionMessage, setInteractionMessage] = useState("");
  const eventsById = useMemo(
    () => new Map(model.events.map((event) => [event.projectionId, event])),
    [model.events],
  );

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api && api.view.type !== toFullCalendarView(view)) api.changeView(toFullCalendarView(view));
  }, [view]);

  useEffect(() => {
    if (previousInitialDate.current === model.initialDate) return;
    calendarRef.current?.getApi().gotoDate(model.initialDate);
    previousInitialDate.current = model.initialDate;
  }, [model.initialDate]);

  useEffect(() => {
    if (navigation.revision === 0) return;
    const api = calendarRef.current?.getApi();
    if (navigation.direction === "previous") api?.prev();
    else if (navigation.direction === "next") api?.next();
    else api?.today();
  }, [navigation]);

  function handleRange(info: DatesSetInfo) {
    onVisibleRangeChange({
      start: info.startStr,
      end: info.endStr,
      view: fromFullCalendarView(info.view.type),
    });
  }

  function renderEvent(info: EventDisplayInfo) {
    const event = eventsById.get(info.event.id);
    return event ? <CalendarEventContent event={event} timeText={info.timeText} /> : null;
  }

  async function applyChange(
    info: EventDropInfo | EventResizeDoneInfo,
    submit: FullCalendarViewProps["onEventMove"],
  ) {
    const original = eventsById.get(info.event.id);
    if (!original) {
      info.revert();
      return;
    }
    if (!original.scheduleInteraction.dragEnabled) {
      info.revert();
      info.el.focus();
      setInteractionMessage(
        `${original.title} stayed at its saved time. ${original.scheduleInteraction.dragDisabledReason ?? "Open task details to edit the future series."}`,
      );
      return;
    }
    try {
      const result = await submit(toCalendarEventChange(info.event, original));
      if (!result.ok) {
        info.revert();
        info.el.focus();
        setInteractionMessage(`${original.title} returned to its saved time. ${result.message}`);
      } else {
        setInteractionMessage(result.announcement ?? `${original.title} schedule saved.`);
      }
    } catch {
      info.revert();
      info.el.focus();
      setInteractionMessage(`${original.title} returned to its saved time. The change was not saved.`);
    }
  }

  if (!hydrationReady) {
    return (
      <div
        className={`${styles.calendarMount} ${styles.calendarPlaceholder}`}
        data-ui="calendar-client-placeholder"
        role="status"
      >
        Preparing calendar…
      </div>
    );
  }

  return (
    <>
      <div className={styles.calendarMount} data-ui="fullcalendar-standard-views">
        <FullCalendar
          ref={calendarRef}
          plugins={plugins}
          initialView={toFullCalendarView(view)}
          initialDate={model.initialDate}
          headerToolbar={false}
          firstDay={model.weekStartsOn}
          timeZone={model.timeZone}
          height="auto"
          expandRows
          nowIndicator
          dayMaxEvents
          editable={!readOnly}
          eventStartEditable={!readOnly}
          eventDurationEditable={!readOnly}
          events={model.events.map((event) => toFullCalendarEvent(event, !readOnly))}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: model.hourCycle === "12" }}
          datesSet={handleRange}
          eventContent={renderEvent}
          eventAfterClass={(info) => {
            const event = eventsById.get(info.event.id);
            return info.isEndResizable && event?.scheduleInteraction.dragEnabled
              ? eventStyles.resizeHandle
              : "";
          }}
          eventClass={(info) => {
            const event = eventsById.get(info.event.id);
            return event?.conflicted
              ? `${eventStyles.calendarEvent} ${eventStyles.conflictedEvent}`
              : eventStyles.calendarEvent!;
          }}
          eventDidMount={(info) => {
            const event = eventsById.get(info.event.id);
            if (!event) return;
            const label = calendarEventAccessibleLabel(event);
            info.el.setAttribute("aria-label", label);
            info.el.setAttribute("title", label);
            const resizeHandle = info.el.querySelector(`.${eventStyles.resizeHandle}`);
            resizeHandle?.setAttribute("aria-hidden", "true");
            resizeHandle?.setAttribute("data-ui", "calendar-event-resize-handle");
          }}
          eventClick={(info) => {
            info.jsEvent.preventDefault();
            const event = eventsById.get(info.event.id);
            if (!event) return;
            onSelectEvent(event.projectionId);
            onOpenTask(event.taskId, { occurrenceKey: event.occurrenceKey });
          }}
          eventDrop={(info) => void applyChange(info, onEventMove)}
          eventResize={(info) => void applyChange(info, onEventResize)}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {interactionMessage}
      </p>
    </>
  );
}

function subscribeToHydration() {
  return () => undefined;
}

function readHydrated() {
  return true;
}

function readServerHydrated() {
  return false;
}
