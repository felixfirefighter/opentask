"use client";

import { MatrixQuadrant } from "./MatrixQuadrant";
import { PermissionState, PlanningConditionBanner, UnavailableDataState } from "./PlanningCondition";
import type {
  MatrixPlanningModel,
  PlanningScreenCondition,
  PlanningTaskActions,
} from "./planning-screen-model";
import styles from "./MatrixScreen.module.css";

export type MatrixScreenProps = Readonly<{
  model: MatrixPlanningModel;
  condition: PlanningScreenCondition;
  taskActions: PlanningTaskActions;
  onRetry?: (() => void) | undefined;
}>;

export function MatrixScreen({ condition, model, onRetry, taskActions }: MatrixScreenProps) {
  const quadrants = [
    model.quadrants.doNow,
    model.quadrants.plan,
    model.quadrants.timeSensitive,
    model.quadrants.later,
  ] as const;
  const total = quadrants.reduce((sum, quadrant) => sum + quadrant.tasks.length, 0);
  const loading = condition.kind === "loading";
  const readOnly =
    loading ||
    condition.kind === "offline" ||
    condition.kind === "error" ||
    condition.kind === "date-changed";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Derived from saved priority and schedule</p>
          <h1 tabIndex={-1} data-route-focus>
            Priority matrix
          </h1>
          <p>{model.boundaryLabel}</p>
        </div>
      </header>
      <section className={styles.rule} aria-labelledby="matrix-rule-heading">
        <h2 id="matrix-rule-heading">How tasks are placed</h2>
        <p>
          High priority means important. A task is urgent when its saved due boundary is overdue or within the
          next 24 hours. Unscheduled tasks are not urgent.
        </p>
      </section>
      <PlanningConditionBanner condition={condition} onRetry={onRetry} />
      {condition.kind === "permission" ? (
        <PermissionState />
      ) : (
        <>
          {total > 0 || loading ? (
            <nav className={styles.jumpNav} aria-label="Jump to a matrix quadrant">
              {quadrants.map((quadrant) => (
                <a href={`#${quadrant.id}-quadrant`} key={quadrant.id}>
                  {quadrant.title}
                </a>
              ))}
            </nav>
          ) : null}
          {condition.kind === "error" && total === 0 ? (
            <UnavailableDataState title="Priority classifications are unavailable" />
          ) : total === 0 && !loading ? (
            <section className={styles.empty} aria-labelledby="matrix-empty-heading">
              <h2 id="matrix-empty-heading" tabIndex={-1} data-planning-recovery-focus>
                No open tasks to prioritize
              </h2>
              <p>Use the global Add task command when there is something new to prioritize.</p>
            </section>
          ) : (
            <div className={styles.grid}>
              {quadrants.map((quadrant) => (
                <MatrixQuadrant
                  key={quadrant.id}
                  actions={taskActions}
                  disabled={readOnly}
                  loading={loading}
                  quadrant={quadrant}
                />
              ))}
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {model.announcement}
          </p>
        </>
      )}
    </div>
  );
}
