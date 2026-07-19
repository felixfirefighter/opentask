"use client";

import { Plus } from "lucide-react";

import { Button } from "@/shared/presentation";

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
  onAddTask: () => void;
  onRetry?: (() => void) | undefined;
}>;

export function MatrixScreen({ condition, model, onAddTask, onRetry, taskActions }: MatrixScreenProps) {
  const quadrants = [
    model.quadrants.doNow,
    model.quadrants.plan,
    model.quadrants.timeSensitive,
    model.quadrants.later,
  ] as const;
  const total = quadrants.reduce((sum, quadrant) => sum + quadrant.tasks.length, 0);
  const loading = condition.kind === "loading";
  const readOnly = loading || condition.kind === "offline" || condition.kind === "error";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Derived from saved priority and schedule</p>
          <h1 tabIndex={-1}>Priority matrix</h1>
          <p>{model.boundaryLabel}</p>
        </div>
        <Button type="button" disabled={readOnly} onClick={onAddTask}>
          <Plus size={17} aria-hidden="true" /> Add task
        </Button>
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
              <h2 id="matrix-empty-heading">No open tasks to prioritize</h2>
              <p>Add a task when there is something you want to place by priority and schedule.</p>
              <Button type="button" variant="secondary" disabled={readOnly} onClick={onAddTask}>
                Add a task
              </Button>
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
