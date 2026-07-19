"use client";

import { ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { plannerInputSchema, type PlannerInput } from "../application/contracts";
import { Button } from "@/shared/presentation";

import { PlannerFailureBanner } from "./PlannerConditionPanel";
import { PlannerConstraintFields } from "./PlannerConstraintFields";
import type { PlannerFailure, PlannerTaskOption } from "./planner-screen-model";
import { PlannerTaskChecklist } from "./PlannerTaskChecklist";
import styles from "./PlannerDescribeStep.module.css";

export function PlannerDescribeStep({
  draft,
  tasks,
  online,
  failure,
  onChange,
  onSubmit,
  onRetry,
}: Readonly<{
  draft: PlannerInput;
  tasks: readonly PlannerTaskOption[];
  online: boolean;
  failure?: PlannerFailure | undefined;
  onChange: (input: PlannerInput) => void;
  onSubmit: (input: PlannerInput) => void;
  onRetry: () => void;
}>) {
  const errorRef = useRef<HTMLDivElement>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const hasContext = draft.brainDump.trim().length > 0 || draft.selectedTaskIds.length > 0;
  const disabledReason = !online
    ? "Reconnect to create a proposal."
    : !hasContext
      ? "Add a brain dump or select at least one task."
      : null;

  useEffect(() => {
    if (validationMessage) errorRef.current?.focus();
  }, [validationMessage]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = plannerInputSchema.safeParse(draft);
    if (!parsed.success) {
      setValidationMessage(parsed.error.issues[0]?.message ?? "Review the planning input.");
      return;
    }
    setValidationMessage(null);
    onSubmit(parsed.data);
  }

  return (
    <>
      {failure ? <PlannerFailureBanner failure={failure} retryDisabled={!online} onRetry={onRetry} /> : null}
      <form className={styles.form} onSubmit={submit} noValidate>
        {validationMessage ? (
          <div className={styles.errorSummary} role="alert" tabIndex={-1} ref={errorRef}>
            <strong>Review the planning input</strong>
            <span>{validationMessage}</span>
            <a href="#planner-brain-dump">Go to the input</a>
          </div>
        ) : null}

        <section className={styles.card} aria-labelledby="describe-input-heading">
          <div className={styles.cardHeading}>
            <div>
              <p className="eyebrow">Input</p>
              <h2 id="describe-input-heading">Describe what needs attention</h2>
            </div>
            <Sparkles size={20} aria-hidden="true" />
          </div>
          <label className={styles.field} htmlFor="planner-brain-dump">
            <span>
              Brain dump <small>(optional when tasks are selected)</small>
            </span>
            <textarea
              id="planner-brain-dump"
              rows={6}
              maxLength={20_000}
              value={draft.brainDump}
              disabled={!online}
              placeholder="Write the work, deadlines, fixed appointments, and anything that feels uncertain."
              onChange={(event) => onChange({ ...draft, brainDump: event.currentTarget.value })}
            />
          </label>
          <PlannerTaskChecklist
            tasks={tasks}
            selectedTaskIds={draft.selectedTaskIds}
            disabled={!online}
            onChange={(selectedTaskIds) => onChange({ ...draft, selectedTaskIds })}
          />
        </section>

        <PlannerConstraintFields draft={draft} disabled={!online} onChange={onChange} />

        <div className={styles.dataUse}>
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            <strong>Review before consequence.</strong> Only this input and selected task context are sent for
            planning. The raw brain dump is not stored, and no task changes until Apply.
          </p>
        </div>
        <div className={styles.formActions}>
          <span id="planner-create-help">
            {disabledReason ?? "You will review every proposed change before it can be applied."}
          </span>
          <Button type="submit" disabled={disabledReason !== null} aria-describedby="planner-create-help">
            <Sparkles size={17} aria-hidden="true" /> Create proposal
          </Button>
        </div>
      </form>
    </>
  );
}
