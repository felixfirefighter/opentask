"use client";

import type { TaskDetailDto } from "../application/contracts";
import { TaskChecklistEditor } from "./TaskChecklistEditor";
import { TaskSubtaskEditor } from "./TaskSubtaskEditor";
import styles from "./TaskStepsEditor.module.css";

export function TaskStepsEditor({ disabled, task }: Readonly<{ disabled: boolean; task: TaskDetailDto }>) {
  return (
    <section className={styles.group} aria-labelledby={`steps-${task.id}`}>
      <h2 id={`steps-${task.id}`}>Steps</h2>
      <TaskSubtaskEditor disabled={disabled} task={task} />
      <TaskChecklistEditor disabled={disabled} task={task} />
    </section>
  );
}
