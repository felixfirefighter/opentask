import { AlertTriangle, CalendarClock, Clock3, Plus, Sparkles } from "lucide-react";

import type { PlannerProposal } from "../application/contracts";
import { Button } from "@/shared/presentation";

import { inputWindowLabel } from "./planner-presentation-format";
import styles from "./PlannerReviewStep.module.css";

export function PlannerReviewSummary({
  proposal,
  counts,
  onEditInput,
}: Readonly<{
  proposal: PlannerProposal;
  counts: Readonly<{ proposed: number; attention: number; deferred: number; uncertain: number }>;
  onEditInput: () => void;
}>) {
  return (
    <>
      <section className={styles.context} aria-label="Planning constraints">
        <span className={styles.contextIcon}>
          <Sparkles size={19} aria-hidden="true" />
        </span>
        <div>
          <strong>{proposal.summary}</strong>
          <p>
            {inputWindowLabel({
              planningDate: proposal.planningDate,
              ...proposal.planningContext,
              bufferMinutes: proposal.planningContext.bufferMinutes,
            })}
          </p>
        </div>
        <Button type="button" variant="quiet" onClick={onEditInput}>
          Edit input
        </Button>
      </section>
      <section className={styles.summary} aria-labelledby="proposal-summary-heading">
        <div>
          <p className="eyebrow">Proposal summary</p>
          <h2 id="proposal-summary-heading" tabIndex={-1}>
            Review every proposed change
          </h2>
        </div>
        <div className={styles.metrics} aria-label="Proposal counts">
          <Metric icon={<CalendarClock size={15} />} value={counts.proposed} label="proposed" />
          <Metric
            icon={<AlertTriangle size={15} />}
            value={counts.attention}
            label="needs attention"
            tone="warning"
          />
          <Metric icon={<Clock3 size={15} />} value={counts.deferred} label="deferred or overflow" />
          <Metric icon={<Plus size={15} />} value={counts.uncertain} label="uncertain" />
        </div>
      </section>
      {proposal.uncertainties.length > 0 ? (
        <section className={styles.globalUncertainty} aria-labelledby="proposal-uncertainty-heading">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <h2 id="proposal-uncertainty-heading">Uncertainties to review</h2>
            <ul>
              {proposal.uncertainties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Metric({
  icon,
  value,
  label,
  tone,
}: Readonly<{ icon: React.ReactNode; value: number; label: string; tone?: "warning" | undefined }>) {
  return (
    <div className={styles.metric} data-tone={tone}>
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
