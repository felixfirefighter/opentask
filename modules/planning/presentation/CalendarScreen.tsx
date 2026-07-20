"use client";

import { useState, type Ref } from "react";

import { useMediaQuery } from "@/shared/presentation";

import { CalendarScheduleFallback } from "./CalendarScheduleFallback";
import { CalendarToolbar } from "./CalendarToolbar";
import { FullCalendarView } from "./FullCalendarView";
import { PermissionState, PlanningConditionBanner } from "./PlanningCondition";
import type {
  CalendarChangeResult,
  CalendarEventChange,
  CalendarPlanningModel,
  CalendarView,
  PlanningOccurrenceAction,
  PlanningScreenCondition,
  VisibleCalendarRange,
} from "./planning-screen-model";
import styles from "./CalendarScreen.module.css";

export type CalendarScreenProps = Readonly<{
  model: CalendarPlanningModel;
  condition: PlanningScreenCondition;
  addTaskRef?: Ref<HTMLButtonElement> | undefined;
  onAddTask: () => void;
  onOpenTask: (taskId: string) => void;
  onEditSchedule: (taskId: string) => void;
  onOccurrenceTransition: (
    taskId: string,
    occurrenceKey: string,
    action: PlanningOccurrenceAction,
    projectionId?: string,
  ) => void;
  onSelectEvent: (eventId: string) => void;
  onViewChange: (view: CalendarView) => void;
  onVisibleRangeChange: (range: VisibleCalendarRange) => void;
  onEventMove: (change: CalendarEventChange) => Promise<CalendarChangeResult>;
  onEventResize: (change: CalendarEventChange) => Promise<CalendarChangeResult>;
  onRetry?: (() => void) | undefined;
}>;

export function CalendarScreen(props: CalendarScreenProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [userSelectedView, setUserSelectedView] = useState(false);
  const [localSelectedEventId, setLocalSelectedEventId] = useState("");
  const [navigation, setNavigation] = useState<{
    revision: number;
    direction: "previous" | "today" | "next";
  }>({ revision: 0, direction: "today" });
  const effectiveView =
    isMobile && !props.model.hasSavedView && !userSelectedView ? "agenda" : props.model.view;
  const requestedEventId = props.model.selectedEventId ?? localSelectedEventId;
  const selectedEventId = props.model.events.some((event) => event.projectionId === requestedEventId)
    ? requestedEventId
    : "";
  const readOnly =
    props.condition.kind === "offline" ||
    props.condition.kind === "loading" ||
    props.condition.kind === "error";

  function chooseEvent(eventId: string) {
    setLocalSelectedEventId(eventId);
    props.onSelectEvent(eventId);
  }

  function chooseView(view: CalendarView) {
    setUserSelectedView(true);
    props.onViewChange(view);
  }

  function navigate(direction: "previous" | "today" | "next") {
    setNavigation((current) => ({ revision: current.revision + 1, direction }));
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Schedule projection · {props.model.timeZoneLabel}</p>
          <h1 tabIndex={-1} data-route-focus>
            Calendar
          </h1>
        </div>
      </header>
      <PlanningConditionBanner condition={props.condition} onRetry={props.onRetry} />
      {props.condition.kind === "permission" ? (
        <PermissionState />
      ) : (
        <>
          <CalendarToolbar
            addTaskRef={props.addTaskRef}
            disabled={props.condition.kind === "offline"}
            rangeLabel={props.model.rangeLabel}
            view={effectiveView}
            onAddTask={props.onAddTask}
            onNavigate={navigate}
            onViewChange={chooseView}
          />
          <p className="sr-only" aria-live="polite">
            {viewLabel(effectiveView)} view, {props.model.rangeLabel}
          </p>
          <CalendarScheduleFallback
            disabled={readOnly}
            events={props.model.events}
            selectedEventId={selectedEventId}
            onEditSchedule={props.onEditSchedule}
            onOccurrenceTransition={props.onOccurrenceTransition}
            onOpenTask={props.onOpenTask}
            onSelectEvent={chooseEvent}
          />
          <section
            className={styles.frame}
            data-view={effectiveView}
            aria-label={`${viewLabel(effectiveView)} calendar, ${props.model.rangeLabel}`}
          >
            {props.model.events.length === 0 && props.condition.kind !== "loading" ? (
              <div className={styles.emptyNotice} role="status">
                {props.condition.kind === "error" ? (
                  <>
                    <strong>Calendar data is unavailable</strong>
                    <span>No partial range is shown as current. Retry to refresh this range.</span>
                  </>
                ) : (
                  <>
                    <strong>No scheduled tasks in this range</strong>
                    <span>Add a task while keeping the calendar orientation visible.</span>
                  </>
                )}
              </div>
            ) : null}
            <FullCalendarView
              model={props.model}
              navigation={navigation}
              readOnly={readOnly}
              view={effectiveView}
              onEventMove={props.onEventMove}
              onEventResize={props.onEventResize}
              onOpenTask={props.onOpenTask}
              onSelectEvent={chooseEvent}
              onVisibleRangeChange={props.onVisibleRangeChange}
            />
            {props.condition.kind === "loading" ? (
              <div className={styles.loadingOverlay} role="status">
                Loading this calendar range…
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function viewLabel(view: CalendarView) {
  return `${view[0]?.toUpperCase()}${view.slice(1)}`;
}
