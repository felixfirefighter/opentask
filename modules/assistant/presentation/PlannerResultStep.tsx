"use client";

import { CalendarDays, CheckCircle2, ListTodo, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import type { PlannerApplyResult, PlannerProposalDto } from "../application/contracts";
import { Button } from "@/shared/presentation";

import { plannerTaskHref } from "./planner-route-navigation";
import type { PlannerTaskLink } from "./planner-screen-model";
import styles from "./PlannerResultStep.module.css";

export function PlannerResultStep({
  proposal,
  result,
  selectedActionCount,
  notAppliedActionCount,
  taskLinks,
  todayHref,
  calendarHref,
  onEditInput,
}: Readonly<{
  proposal: PlannerProposalDto;
  result: PlannerApplyResult;
  selectedActionCount: number;
  notAppliedActionCount: number;
  taskLinks: readonly PlannerTaskLink[];
  todayHref: string;
  calendarHref: string;
  onEditInput: () => void;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alreadyApplied = result.outcome === "already_applied";
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className={styles.result} aria-labelledby="planner-result-heading" aria-live="polite">
      <span className={styles.icon}>
        <CheckCircle2 size={28} aria-hidden="true" />
      </span>
      <p className="eyebrow">Atomic result</p>
      <h2 id="planner-result-heading" ref={headingRef} tabIndex={-1}>
        {alreadyApplied ? "This proposal was already applied" : "Your selected changes were applied"}
      </h2>
      <p>
        {alreadyApplied
          ? "The idempotency check prevented duplicate changes. Your saved tasks were not changed again."
          : `${result.appliedActionCount} ${result.appliedActionCount === 1 ? "action was" : "actions were"} committed together.`}
      </p>

      <dl className={styles.counts}>
        <div>
          <dt>Selected</dt>
          <dd>{selectedActionCount}</dd>
        </div>
        <div>
          <dt>{alreadyApplied ? "Duplicated" : "Applied"}</dt>
          <dd>{alreadyApplied ? 0 : result.appliedActionCount}</dd>
        </div>
        <div>
          <dt>Not applied</dt>
          <dd>{notAppliedActionCount}</dd>
        </div>
      </dl>
      {notAppliedActionCount > 0 ? (
        <p className={styles.note}>
          Deselected, invalid, or deferred items remain outside this applied result.
        </p>
      ) : null}
      <div className={styles.summary}>
        <strong>Proposal summary</strong>
        <span>{proposal.proposal.summary}</span>
      </div>
      {taskLinks.length > 0 ? (
        <div className={styles.taskLinks}>
          <strong>Applied tasks</strong>
          <ul>
            {taskLinks.map((task) => (
              <li key={task.id}>
                <Link href={plannerTaskHref(task.id, proposal.id)}>{task.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className={styles.actions}>
        <Button asChild>
          <Link href={todayHref}>
            <ListTodo size={17} aria-hidden="true" /> Open Today
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={calendarHref}>
            <CalendarDays size={17} aria-hidden="true" /> Open Calendar
          </Link>
        </Button>
        <Button type="button" variant="quiet" onClick={onEditInput}>
          <RefreshCw size={16} aria-hidden="true" /> Create another proposal
        </Button>
      </div>
    </section>
  );
}
