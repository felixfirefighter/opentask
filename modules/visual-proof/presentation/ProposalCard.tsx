import { AlertTriangle, ArrowRight, Check, Pencil, Sparkles } from "lucide-react";

import type { ProposalAction } from "../fixtures";
import styles from "./ProposalCard.module.css";

export function ProposalCard({
  action,
  checked,
  disabled = false,
  onToggle,
}: {
  action: ProposalAction;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const inputId = `proposal-${action.id}`;
  return (
    <article
      className={styles.proposalCard}
      data-selected={checked || undefined}
      data-disabled={disabled || undefined}
    >
      <label className={styles.selector} htmlFor={inputId}>
        <input id={inputId} type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <span>{checked && <Check size={14} />}</span>
        <span className="sr-only">
          Select {action.kind.toLowerCase()} action for {action.title}
        </span>
      </label>
      <div className={styles.proposalBody}>
        <div className={styles.proposalTitle}>
          <span className={styles.kind} data-kind={action.kind.toLowerCase()}>
            {action.kind}
          </span>
          <h3>{action.title}</h3>
          {!disabled && (
            <button
              className="icon-button"
              type="button"
              aria-label={`Edit ${action.title}`}
              title="Edit proposal"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
        <div className={styles.diff}>
          <div>
            <span>Before</span>
            <p>{action.before}</p>
          </div>
          <ArrowRight size={17} aria-hidden="true" />
          <div>
            <span>After</span>
            <p>{action.after}</p>
          </div>
        </div>
        <p className={styles.rationale}>
          {disabled ? <AlertTriangle size={15} /> : <Sparkles size={15} />}
          <span>
            <strong>{disabled ? "Doesn’t fit: " : "Why this change: "}</strong>
            {action.rationale}
          </span>
        </p>
      </div>
    </article>
  );
}
