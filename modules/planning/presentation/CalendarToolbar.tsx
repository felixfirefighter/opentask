"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Ref } from "react";

import { Button } from "@/shared/presentation";

import type { CalendarView } from "./planning-screen-model";
import styles from "./CalendarScreen.module.css";

const views: readonly Readonly<{ id: CalendarView; label: string }>[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
  { id: "agenda", label: "Agenda" },
];

export function CalendarToolbar({
  addTaskDisabled,
  disabled,
  addTaskRef,
  rangeLabel,
  view,
  onAddTask,
  onNavigate,
  onViewChange,
}: Readonly<{
  addTaskDisabled: boolean;
  disabled: boolean;
  addTaskRef?: Ref<HTMLButtonElement> | undefined;
  rangeLabel: string;
  view: CalendarView;
  onAddTask: () => void;
  onNavigate: (direction: "previous" | "today" | "next") => void;
  onViewChange: (view: CalendarView) => void;
}>) {
  return (
    <div className={styles.toolbar} aria-label="Calendar controls">
      <div className={styles.rangeControls}>
        <Button
          type="button"
          variant="icon"
          aria-label="Previous range"
          disabled={disabled}
          onClick={() => onNavigate("previous")}
        >
          <ChevronLeft size={19} aria-hidden="true" />
        </Button>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onNavigate("today")}>
          Today
        </Button>
        <Button
          type="button"
          variant="icon"
          aria-label="Next range"
          disabled={disabled}
          onClick={() => onNavigate("next")}
        >
          <ChevronRight size={19} aria-hidden="true" />
        </Button>
        <strong className={styles.rangeLabel}>{rangeLabel}</strong>
      </div>
      <div className={styles.viewControl} aria-label="Calendar view">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            aria-pressed={view === item.id}
            onClick={() => onViewChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Button ref={addTaskRef} type="button" disabled={disabled || addTaskDisabled} onClick={onAddTask}>
        <Plus size={17} aria-hidden="true" /> Add task
      </Button>
    </div>
  );
}
