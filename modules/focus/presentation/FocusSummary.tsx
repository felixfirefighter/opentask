import { Clock3, CalendarDays } from "lucide-react";

import { Button } from "@/shared/presentation";

import type { FocusSummaryView } from "./focus-screen-model";
import { formatFocusDuration } from "./focus-time-format";
import styles from "./FocusSummary.module.css";

export function FocusSummary({
  onRetry,
  summary,
}: Readonly<{ onRetry: () => void; summary: FocusSummaryView }>) {
  const totals = summary.kind === "ready" ? summary : summary.kind === "error" ? summary.cached : undefined;
  return (
    <section className={styles.card} aria-labelledby="focus-summary-heading">
      <div className={styles.header}>
        <div>
          <p className="eyebrow">Your time</p>
          <h2 id="focus-summary-heading">Summary</h2>
        </div>
      </div>
      {summary.kind === "loading" ? (
        <div className={styles.loading} aria-busy="true">
          <p className="sr-only" role="status">
            Loading Focus totals
          </p>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </div>
      ) : null}
      {summary.kind === "error" ? (
        <div className={styles.error} role="alert">
          <strong>Focus totals could not be loaded</strong>
          <span>{summary.message}</span>
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry totals
          </Button>
        </div>
      ) : null}
      {totals ? (
        <dl className={styles.totals}>
          <div>
            <dt>
              <Clock3 size={17} aria-hidden="true" /> Today
            </dt>
            <dd>{formatFocusDuration(totals.todaySeconds)}</dd>
          </div>
          <div>
            <dt>
              <CalendarDays size={17} aria-hidden="true" /> Last seven days
            </dt>
            <dd>{formatFocusDuration(totals.sevenDaySeconds)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
