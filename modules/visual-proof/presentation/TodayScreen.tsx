"use client";

import { CalendarDays, ChevronRight, Clock3, Plus, Sparkles, Sunrise } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { anytimeTasks, overdueTasks, timedTasks, type FixtureTask } from "./fixtures";
import { TaskRow } from "./TaskRow";
import styles from "./TodayScreen.module.css";
import { VisualProofShell } from "./VisualProofShell";

export function TodayScreen() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  function toggleTask(id: string) {
    setCompleted((current) => toggleSetValue(current, id));
  }

  return (
    <VisualProofShell active="today">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className="eyebrow">Saturday · Singapore time</p>
            <h1>Today</h1>
            <p className={styles.date}>18 July 2026</p>
          </div>
          <div className={styles.headerActions}>
            <Link className="secondary-button" href="/calendar">
              <CalendarDays size={17} /> Calendar
            </Link>
            <button type="button" className="primary-button">
              <Plus size={17} /> Add task
            </button>
          </div>
        </header>

        <section className={styles.summary} aria-label="Today summary">
          <div className={styles.summaryLead}>
            <span className={styles.sunIcon}>
              <Sunrise size={19} />
            </span>
            <div>
              <strong>A focused day, with room to breathe.</strong>
              <span>5 tasks · 3h 15m scheduled</span>
            </div>
          </div>
          <Link href="/plan" className={styles.planLink}>
            <Sparkles size={16} /> Review today&apos;s plan <ChevronRight size={15} />
          </Link>
        </section>

        <section className={styles.quickAdd} aria-labelledby="quick-add-label">
          <label id="quick-add-label" htmlFor="quick-add">
            <Plus size={18} />
            <span className="sr-only">Add a task</span>
          </label>
          <input id="quick-add" placeholder="Add a task for today…" defaultValue="" />
          <span className="chip">
            <Clock3 size={13} /> Today
          </span>
          <kbd>Enter</kbd>
        </section>

        <div className={styles.workList}>
          <TaskSection label="Overdue" count={1} tone="danger">
            {overdueTasks.map((task) => renderTask(task, completed, toggleTask))}
          </TaskSection>
          <TaskSection label="Timed" count={2}>
            {timedTasks.map((task) => renderTask(task, completed, toggleTask))}
          </TaskSection>
          <TaskSection label="Anytime" count={2}>
            {anytimeTasks.map((task) => renderTask(task, completed, toggleTask))}
          </TaskSection>
        </div>
      </div>
    </VisualProofShell>
  );
}

function TaskSection({
  label,
  count,
  tone,
  children,
}: {
  label: string;
  count: number;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section className={styles.taskSection} aria-labelledby={`${label.toLowerCase()}-heading`}>
      <div className={styles.sectionHeading} data-tone={tone}>
        <div>
          <h2 id={`${label.toLowerCase()}-heading`}>{label}</h2>
          <span>{count}</span>
        </div>
      </div>
      <div className={styles.rows}>{children}</div>
    </section>
  );
}

function renderTask(task: FixtureTask, completed: Set<string>, toggleTask: (id: string) => void) {
  return (
    <TaskRow
      key={task.id}
      title={task.title}
      meta={task.meta}
      priority={task.priority}
      tag={task.tag}
      accent={task.accent}
      completed={completed.has(task.id)}
      onToggle={() => toggleTask(task.id)}
    />
  );
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
