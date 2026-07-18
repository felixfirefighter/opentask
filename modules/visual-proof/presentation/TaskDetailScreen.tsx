"use client";

import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  Circle,
  Flag,
  ListTodo,
  MoreHorizontal,
  Plus,
  Repeat2,
  Tag,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { anytimeTasks, timedTasks } from "./fixtures";
import { TaskRow } from "./TaskRow";
import styles from "./TaskDetailScreen.module.css";
import { VisualProofShell } from "./VisualProofShell";

export function TaskDetailScreen() {
  return (
    <VisualProofShell active="tasks" inspector={<TaskDetailPanel />}>
      <TaskContext />
    </VisualProofShell>
  );
}

function TaskContext() {
  return (
    <div className={styles.contextPage}>
      <header className={styles.contextHeader}>
        <div>
          <p className="eyebrow">Personal</p>
          <h1>Build Week</h1>
          <p>4 open tasks</p>
        </div>
        <button type="button" className="primary-button">
          <Plus size={17} /> Add task
        </button>
      </header>
      <div className={styles.contextRows}>
        <div className={styles.selectedRow}>
          <TaskRow {...timedTasks[0]!} />
        </div>
        <TaskRow {...timedTasks[1]!} />
        <TaskRow {...anytimeTasks[1]!} />
      </div>
    </div>
  );
}

function TaskDetailPanel() {
  const [steps, setSteps] = useState([true, false, false]);

  function toggleStep(index: number) {
    setSteps((current) => current.map((value, itemIndex) => (itemIndex === index ? !value : value)));
  }

  return (
    <div className={styles.panel}>
      <header className={styles.panelHeader}>
        <Link className={styles.mobileBack} href="/today" aria-label="Back to Today">
          <ChevronLeft size={20} />
        </Link>
        <button type="button" className={styles.taskStatus} aria-label="Complete task">
          <Circle size={19} /> <span>Open</span>
        </button>
        <div className={styles.panelActions}>
          <button type="button" className="icon-button" aria-label="More task actions">
            <MoreHorizontal size={18} />
          </button>
          <Link className="icon-button" href="/today" aria-label="Close task details">
            <X size={18} />
          </Link>
        </div>
      </header>

      <div className={styles.panelBody}>
        <label className="sr-only" htmlFor="task-title">
          Task title
        </label>
        <textarea
          id="task-title"
          className={styles.titleInput}
          defaultValue="Record the two-minute demo"
          rows={2}
        />
        <p className={styles.saveState}>
          <Check size={13} /> Saved locally for this visual proof
        </p>

        <section className={styles.fieldGroup} aria-labelledby="schedule-heading">
          <h2 id="schedule-heading">Schedule</h2>
          <DetailRow icon={<CalendarClock size={17} />} label="Today" value="10:30–11:30 AM" />
          <DetailRow icon={<Repeat2 size={17} />} label="Repeat" value="Does not repeat" muted />
          <DetailRow icon={<Bell size={17} />} label="Reminder" value="10 minutes before" />
        </section>

        <section className={styles.fieldGroup} aria-labelledby="organize-heading">
          <h2 id="organize-heading">Organization</h2>
          <DetailRow icon={<Flag size={17} />} label="Priority" value="High" tone="danger" />
          <DetailRow icon={<ListTodo size={17} />} label="List" value="Build Week" />
          <DetailRow icon={<Tag size={17} />} label="Tags" value="Launch · Video" />
        </section>

        <section className={styles.fieldGroup} aria-labelledby="steps-heading">
          <div className={styles.groupHeading}>
            <h2 id="steps-heading">Checklist</h2>
            <span>1 of 3</span>
          </div>
          <div className={styles.steps}>
            {["Hide personal notifications", "Record the core workflow", "Add captions and upload"].map(
              (step, index) => (
                <label className={styles.step} key={step}>
                  <input type="checkbox" checked={steps[index]} onChange={() => toggleStep(index)} />
                  <span data-done={steps[index] || undefined}>{step}</span>
                </label>
              ),
            )}
          </div>
          <button type="button" className={styles.addStep}>
            <Plus size={15} /> Add checklist item
          </button>
        </section>

        <section className={styles.fieldGroup} aria-labelledby="notes-heading">
          <h2 id="notes-heading">Notes</h2>
          <p className={styles.description}>
            Show quick capture, Calendar planning, a focus session, and the review-before-apply planner. Keep
            the cursor movement deliberate.
          </p>
        </section>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  muted,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  tone?: "danger";
}) {
  return (
    <button type="button" className={styles.detailRow} data-muted={muted || undefined} data-tone={tone}>
      <span className={styles.detailIcon}>{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
      <ChevronDown size={15} />
    </button>
  );
}
