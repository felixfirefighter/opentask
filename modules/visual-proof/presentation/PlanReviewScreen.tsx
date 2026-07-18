"use client";

import { ArrowLeft, CalendarDays, Check, Clock3, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { proposalActions } from "./fixtures";
import { ProposalCard } from "./ProposalCard";
import styles from "./PlanReviewScreen.module.css";
import { VisualProofShell } from "./VisualProofShell";

export function PlanReviewScreen() {
  const [selected, setSelected] = useState(
    () => new Set(proposalActions.filter((action) => action.selected).map((action) => action.id)),
  );
  const selectedCount = selected.size;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <VisualProofShell active="plan">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className="eyebrow">Reality-aware planner</p>
            <h1>Review your proposal</h1>
            <p>Nothing changes until you choose what to apply.</p>
          </div>
          <Link className="secondary-button" href="/today">
            <ArrowLeft size={16} /> Back to Today
          </Link>
        </header>

        <ol className={styles.steps} aria-label="Planning progress">
          <Step number="1" label="Describe" state="complete" />
          <Step number="2" label="Review" state="current" />
          <Step number="3" label="Result" />
        </ol>

        <section className={styles.context} aria-label="Planning constraints">
          <div className={styles.contextIcon}>
            <Sparkles size={19} />
          </div>
          <div>
            <strong>Plan the launch work without moving the 2 PM review.</strong>
            <p>Today · 9:00 AM–5:00 PM · 30 min buffer · Singapore time</p>
          </div>
          <button type="button" className="quiet-button">
            Edit input
          </button>
        </section>

        <section className={styles.summary} aria-labelledby="proposal-summary">
          <div>
            <p className="eyebrow">Proposal summary</p>
            <h2 id="proposal-summary">A realistic plan with one trade-off</h2>
          </div>
          <div className={styles.metrics}>
            <Metric value="2" label="ready" tone="ready" />
            <Metric value="1" label="needs review" tone="attention" />
            <Metric value="1" label="doesn’t fit" tone="overflow" />
          </div>
        </section>

        <ProposalGroup title="Needs attention" detail="Check the estimate before applying." tone="attention">
          {proposalActions
            .filter((action) => action.tone === "attention")
            .map((action) => (
              <ProposalCard
                key={action.id}
                action={action}
                checked={selected.has(action.id)}
                onToggle={() => toggle(action.id)}
              />
            ))}
        </ProposalGroup>

        <ProposalGroup title="Scheduled and created" detail="These changes fit inside your work window.">
          {proposalActions
            .filter((action) => action.tone === "ready")
            .map((action) => (
              <ProposalCard
                key={action.id}
                action={action}
                checked={selected.has(action.id)}
                onToggle={() => toggle(action.id)}
              />
            ))}
        </ProposalGroup>

        <ProposalGroup
          title="Deferred"
          detail="Kept visible so nothing disappears from the plan."
          tone="overflow"
        >
          {proposalActions
            .filter((action) => action.tone === "overflow")
            .map((action) => (
              <ProposalCard
                key={action.id}
                action={action}
                checked={false}
                disabled
                onToggle={() => undefined}
              />
            ))}
        </ProposalGroup>

        <div className={styles.applySpacer} aria-hidden="true" />
      </div>

      <div className={styles.applyBar}>
        <div>
          <span className={styles.selectedCount}>
            <Check size={15} /> {selectedCount} selected
          </span>
          <span>Atomic apply · nothing is saved yet</span>
        </div>
        <button type="button" className="primary-button" disabled={selectedCount === 0}>
          Apply {selectedCount} {selectedCount === 1 ? "change" : "changes"}
        </button>
      </div>
    </VisualProofShell>
  );
}

function Step({ number, label, state }: { number: string; label: string; state?: "complete" | "current" }) {
  return (
    <li data-state={state}>
      <span>{state === "complete" ? <Check size={14} /> : number}</span>
      <strong>{label}</strong>
    </li>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProposalGroup({
  title,
  detail,
  tone,
  children,
}: {
  title: string;
  detail: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={styles.group}
      data-tone={tone}
      aria-labelledby={`group-${title.replaceAll(" ", "-").toLowerCase()}`}
    >
      <div className={styles.groupHeading}>
        <span>
          {tone === "attention" ? (
            <Info size={16} />
          ) : tone === "overflow" ? (
            <Clock3 size={16} />
          ) : (
            <CalendarDays size={16} />
          )}
        </span>
        <div>
          <h2 id={`group-${title.replaceAll(" ", "-").toLowerCase()}`}>{title}</h2>
          <small>{detail}</small>
        </div>
      </div>
      <div className={styles.groupCards}>{children}</div>
    </section>
  );
}
