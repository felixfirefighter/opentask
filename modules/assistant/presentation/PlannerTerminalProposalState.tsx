"use client";

import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import type { PlannerProposalDto } from "../application/contracts";
import { Button } from "@/shared/presentation";

import styles from "./PlannerReviewStep.module.css";

export function PlannerTerminalProposalState({
  proposal,
  todayHref,
  calendarHref,
  onEditInput,
}: Readonly<{
  proposal: PlannerProposalDto;
  todayHref: string;
  calendarHref: string;
  onEditInput: () => void;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const content =
    proposal.status === "applied"
      ? {
          icon: CheckCircle2,
          title: "This proposal was already applied",
          message: "No duplicate task changes can be made from it.",
        }
      : proposal.status === "rejected"
        ? {
            icon: XCircle,
            title: "This proposal was rejected",
            message: "No task changes were applied from it.",
          }
        : {
            icon: Clock3,
            title: "This proposal expired",
            message: "Create a new proposal so current tasks and schedules can be checked again.",
          };
  const Icon = content.icon;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className={styles.terminal} aria-labelledby="terminal-proposal-heading">
      <Icon size={25} aria-hidden="true" />
      <h2 id="terminal-proposal-heading" ref={headingRef} tabIndex={-1}>
        {content.title}
      </h2>
      <p>{content.message}</p>
      <div>
        <Button type="button" variant="secondary" onClick={onEditInput}>
          Edit input
        </Button>
        <Button asChild variant="secondary">
          <Link href={todayHref}>Open Today</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={calendarHref}>Open Calendar</Link>
        </Button>
      </div>
    </section>
  );
}
