"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { AppShell } from "@/shared/presentation/AppShell";

import { CalendarViews, type CalendarView } from "./CalendarViews";
import styles from "./CalendarScreen.module.css";

const views: CalendarView[] = ["Month", "Week", "Day", "Agenda"];

export function CalendarScreen() {
  const isMobile = useSyncExternalStore(subscribeToMobileViewport, readMobileViewport, () => false);
  const [chosenView, setChosenView] = useState<CalendarView | null>(null);
  const [rangeOffset, setRangeOffset] = useState(0);
  const view = chosenView ?? (isMobile ? "Agenda" : "Month");

  const rangeLabel = rangeOffset === 0 ? rangeForView(view) : offsetLabel(view, rangeOffset);

  function chooseView(nextView: CalendarView) {
    setChosenView(nextView);
    setRangeOffset(0);
  }

  function moveRange(direction: -1 | 1) {
    const nextOffset = rangeOffset + direction;
    setRangeOffset(nextOffset);
  }

  function resetToday() {
    setRangeOffset(0);
  }

  return (
    <AppShell active="calendar">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className="eyebrow">Schedule projection · Singapore time</p>
            <h1>Calendar</h1>
          </div>
          <button type="button" className="primary-button">
            <Plus size={17} /> Add task
          </button>
        </header>

        <div className={styles.toolbar} aria-label="Calendar controls">
          <div className={styles.rangeControls}>
            <button
              className="icon-button"
              type="button"
              aria-label="Previous range"
              onClick={() => moveRange(-1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button className="secondary-button" type="button" onClick={resetToday}>
              Today
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Next range"
              onClick={() => moveRange(1)}
            >
              <ChevronRight size={19} />
            </button>
            <strong className={styles.rangeLabel}>{rangeLabel}</strong>
          </div>

          <div className={styles.viewControl} aria-label="Calendar view">
            {views.map((item) => (
              <button key={item} type="button" aria-pressed={view === item} onClick={() => chooseView(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {view} view, {rangeLabel}
        </p>
        <CalendarViews view={view} />
      </div>
    </AppShell>
  );
}

function rangeForView(view: CalendarView) {
  if (view === "Month") return "July 2026";
  if (view === "Day") return "Saturday, 18 July";
  return "20–26 July 2026";
}

function offsetLabel(view: CalendarView, offset: number) {
  const direction = offset < 0 ? "Previous" : "Next";
  if (view === "Month") return `${direction} month`;
  if (view === "Day") return `${direction} day`;
  return `${direction} week`;
}

function subscribeToMobileViewport(onChange: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}
