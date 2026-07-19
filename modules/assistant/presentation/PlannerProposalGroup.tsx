import { AlertTriangle, CalendarDays, Clock3, Plus } from "lucide-react";

import type { ReviewGroupId } from "./planner-review-policy";
import styles from "./PlannerReviewStep.module.css";

const groupContent = {
  attention: {
    title: "Needs attention",
    detail: "Resolve invalid or stale items and review uncertainty.",
    icon: AlertTriangle,
  },
  changed: {
    title: "Scheduled and updated",
    detail: "These changes fit the current proposal constraints.",
    icon: CalendarDays,
  },
  created: {
    title: "New tasks",
    detail: "These tasks will be created only if selected and applied.",
    icon: Plus,
  },
  deferred: {
    title: "Deferred and overflow",
    detail: "Kept visible so no proposed work silently disappears.",
    icon: Clock3,
  },
} as const;

export function PlannerProposalGroup({
  group,
  children,
}: Readonly<{ group: ReviewGroupId; children: React.ReactNode }>) {
  const content = groupContent[group];
  const Icon = content.icon;
  const headingId = `proposal-group-${group}`;
  return (
    <section className={styles.group} data-group={group} aria-labelledby={headingId}>
      <header className={styles.groupHeading}>
        <Icon size={17} aria-hidden="true" />
        <div>
          <h2 id={headingId}>{content.title}</h2>
          <p>{content.detail}</p>
        </div>
      </header>
      <div className={styles.groupCards}>{children}</div>
    </section>
  );
}
