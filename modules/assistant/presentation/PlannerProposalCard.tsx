"use client";

import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronUp, Clock3, Info } from "lucide-react";
import { useId, useState } from "react";

import type { PlannerAction, PlannerPlanningContext } from "../application/contracts";
import { Button } from "@/shared/presentation";

import { PlannerActionEditor } from "./PlannerActionEditor";
import { actionSummary } from "./planner-action-summary";
import { actionLabel } from "./planner-presentation-format";
import type { PlannerActionIssue } from "./planner-screen-model";
import styles from "./PlannerProposalCard.module.css";

export function PlannerProposalCard({
  action,
  target,
  selected,
  issues,
  overflow,
  planningDate,
  planningContext,
  operationDisabled,
  editable,
  onToggle,
  onChange,
}: Readonly<{
  action: PlannerAction;
  target: string;
  selected: boolean;
  issues: readonly PlannerActionIssue[];
  overflow: string | null;
  planningDate: string;
  planningContext: PlannerPlanningContext;
  operationDisabled: boolean;
  editable: boolean;
  onToggle: () => void;
  onChange: (action: PlannerAction) => void;
}>) {
  const [editing, setEditing] = useState(false);
  const inputId = useId();
  const detailId = useId();
  const summary = actionSummary(action);
  const blocked = issues.length > 0;

  return (
    <article
      className={styles.card}
      data-selected={selected || undefined}
      data-blocked={blocked || undefined}
    >
      <label className={styles.selector} htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={selected && !blocked}
          disabled={blocked || operationDisabled}
          aria-describedby={detailId}
          onChange={onToggle}
        />
        <span aria-hidden="true">{selected && !blocked ? <Check size={14} /> : null}</span>
        <span className="sr-only">
          Select {actionLabel(action).toLowerCase()} action for {target}
        </span>
      </label>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.actionKind} data-kind={action.kind}>
            {actionLabel(action)}
          </span>
          <h3>{target}</h3>
          {editable ? (
            <Button
              type="button"
              variant="quiet"
              disabled={operationDisabled}
              aria-expanded={editing}
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
              {editing ? "Done editing" : "Edit change"}
            </Button>
          ) : null}
        </div>

        <div className={styles.diff}>
          <div>
            <span>Before</span>
            <p>{summary.before}</p>
          </div>
          <ArrowRight size={17} aria-hidden="true" />
          <div>
            <span>After</span>
            <p>{summary.after}</p>
          </div>
        </div>

        {editing ? (
          <div className={styles.editor}>
            <PlannerActionEditor
              action={action}
              planningDate={planningDate}
              planningContext={planningContext}
              disabled={operationDisabled}
              onChange={onChange}
            />
          </div>
        ) : null}

        <div className={styles.detail} id={detailId}>
          <p className={styles.rationale}>
            <Info size={16} aria-hidden="true" />
            <span>
              <strong>Why this change:</strong> {action.rationale}
            </span>
          </p>
          {action.uncertainties.length > 0 ? (
            <div className={styles.notice} data-tone="warning">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <strong>Uncertainty</strong>
                <ul>
                  {action.uncertainties.map((uncertainty) => (
                    <li key={uncertainty}>{uncertainty}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {overflow ? (
            <div className={styles.notice}>
              <Clock3 size={16} aria-hidden="true" />
              <div>
                <strong>Does not fit</strong>
                <p>{overflow}</p>
              </div>
            </div>
          ) : null}
          {issues.map((issue, index) => (
            <div className={styles.notice} data-tone="danger" key={`${issue.kind}-${index}`}>
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <strong>
                  {issue.kind === "stale"
                    ? "Changed elsewhere"
                    : issue.kind === "conflict"
                      ? "Planning conflict"
                      : "Invalid edit"}
                </strong>
                <p>{issue.message}</p>
                {issue.latestBefore ? (
                  <p>
                    <strong>Latest value:</strong> {issue.latestBefore}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
