import type { PlanningTaskActions, PlanningTaskRowModel } from "./planning-screen-model";
import { ProjectionTaskRow } from "./ProjectionTaskRow";
import styles from "./ProjectionScreen.module.css";

export function TaskProjectionSection({
  actions,
  disabled,
  headingId,
  label,
  tasks,
  tone,
}: Readonly<{
  actions: PlanningTaskActions;
  disabled: boolean;
  headingId: string;
  label: string;
  tasks: readonly PlanningTaskRowModel[];
  tone?: "danger" | undefined;
}>) {
  if (tasks.length === 0) return null;
  const countLabel = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <header className={styles.sectionHeader} data-tone={tone}>
        <h2 id={headingId} tabIndex={-1}>
          {label}
        </h2>
        <span>{countLabel}</span>
      </header>
      <div className={styles.rows} role="list" aria-label={`${label}, ${countLabel}`}>
        {tasks.map((task) => (
          <div role="listitem" key={task.id}>
            <ProjectionTaskRow actions={actions} disabled={disabled || task.conflicted} task={task} />
          </div>
        ))}
      </div>
    </section>
  );
}
