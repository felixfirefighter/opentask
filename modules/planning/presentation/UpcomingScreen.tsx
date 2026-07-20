"use client";

import { Plus } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/shared/presentation";

import {
  LoadingRows,
  PermissionState,
  PlanningConditionBanner,
  UnavailableDataState,
} from "./PlanningCondition";
import { PlanningQuickAdd } from "./PlanningQuickAdd";
import type {
  PlanningScreenCondition,
  PlanningTaskActions,
  QuickAddModel,
  UpcomingPlanningModel,
} from "./planning-screen-model";
import { ProjectionTaskRow } from "./ProjectionTaskRow";
import styles from "./ProjectionScreen.module.css";

export type UpcomingScreenProps = Readonly<{
  model: UpcomingPlanningModel;
  condition: PlanningScreenCondition;
  quickAdd: QuickAddModel;
  taskActions: PlanningTaskActions;
  onQuickAddChange: (value: string) => void;
  onQuickAddSubmit: (value: string) => void;
  onEditQuickAddToken?: ((tokenId: string) => void) | undefined;
  onRemoveQuickAddToken?: ((tokenId: string) => void) | undefined;
  onRetry?: (() => void) | undefined;
}>;

export function UpcomingScreen(props: UpcomingScreenProps) {
  const { condition, model, onRetry, taskActions } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const total = model.groups.reduce((sum, group) => sum + group.tasks.length, 0);
  const readOnly =
    condition.kind === "offline" || condition.kind === "loading" || condition.kind === "date-changed";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Next 7 days · {model.timeZoneLabel}</p>
          <h1 tabIndex={-1} data-route-focus>
            Upcoming
          </h1>
          <p className={styles.subtitle}>{model.rangeLabel}</p>
        </div>
        <Button type="button" disabled={readOnly} onClick={() => inputRef.current?.focus()}>
          <Plus size={17} aria-hidden="true" /> Add task
        </Button>
      </header>
      <PlanningConditionBanner condition={condition} onRetry={onRetry} />
      {condition.kind === "permission" ? (
        <PermissionState />
      ) : (
        <>
          <PlanningQuickAdd
            model={props.quickAdd}
            inputRef={inputRef}
            disabled={readOnly}
            onChange={props.onQuickAddChange}
            onSubmit={props.onQuickAddSubmit}
            onEditToken={props.onEditQuickAddToken}
            onRemoveToken={props.onRemoveQuickAddToken}
          />
          {condition.kind === "loading" ? (
            <LoadingRows label="Loading upcoming tasks" />
          ) : condition.kind === "error" && total === 0 ? (
            <UnavailableDataState title="Upcoming tasks are unavailable" />
          ) : total === 0 ? (
            <section className={styles.empty} aria-labelledby="upcoming-empty-heading">
              <h2 id="upcoming-empty-heading" tabIndex={-1} data-planning-recovery-focus>
                Nothing in the next 7 days
              </h2>
              <p>Add a task when you know what belongs in this range.</p>
              <Button
                type="button"
                variant="secondary"
                disabled={readOnly}
                onClick={() => inputRef.current?.focus()}
              >
                Add a task
              </Button>
            </section>
          ) : (
            <div className={styles.sections} aria-label={model.totalLabel}>
              {model.groups.map((group) => (
                <section className={styles.section} aria-labelledby={`upcoming-${group.id}`} key={group.id}>
                  <header className={styles.sectionHeader}>
                    <h2 id={`upcoming-${group.id}`} tabIndex={-1}>
                      {group.dateLabel}
                    </h2>
                    <span>
                      {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
                    </span>
                  </header>
                  <div className={styles.rows} role="list" aria-label={`${group.dateLabel} tasks`}>
                    {group.tasks.map((task) => (
                      <div role="listitem" key={task.id}>
                        <ProjectionTaskRow
                          actions={taskActions}
                          disabled={readOnly || task.conflicted}
                          task={task}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
