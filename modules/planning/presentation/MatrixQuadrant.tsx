import { LoadingRows } from "./PlanningCondition";
import type { MatrixQuadrantModel, PlanningTaskActions } from "./planning-screen-model";
import { ProjectionTaskRow } from "./ProjectionTaskRow";
import styles from "./MatrixScreen.module.css";

export function MatrixQuadrant({
  actions,
  disabled,
  disabledReason,
  loading,
  quadrant,
}: Readonly<{
  actions: PlanningTaskActions;
  disabled: boolean;
  disabledReason?: string | undefined;
  loading: boolean;
  quadrant: MatrixQuadrantModel;
}>) {
  const headingId = `matrix-${quadrant.id}`;
  return (
    <section
      className={styles.quadrant}
      data-category={quadrant.category}
      aria-labelledby={headingId}
      id={`${quadrant.id}-quadrant`}
    >
      <header>
        <div>
          <h2 id={headingId} tabIndex={-1}>
            {quadrant.title}
          </h2>
          <p>{quadrant.ruleLabel}</p>
        </div>
        {loading ? <span className="sr-only">Count loading</span> : <span>{quadrant.tasks.length}</span>}
      </header>
      {loading ? (
        <LoadingRows label={`Loading ${quadrant.title} tasks`} />
      ) : quadrant.tasks.length === 0 ? (
        <p className={styles.quadrantEmpty}>No tasks in this quadrant</p>
      ) : (
        <div role="list" aria-label={`${quadrant.title}, ${quadrant.ruleLabel}`}>
          {quadrant.tasks.map((task) => (
            <div role="listitem" key={task.projectionId}>
              <ProjectionTaskRow
                actions={actions}
                disabled={disabled || task.conflicted}
                disabledReason={disabledReason}
                task={task}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
