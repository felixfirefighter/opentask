import { AlertTriangle, KeyRound, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/presentation";

import { failureContent } from "./planner-presentation-format";
import type { PlannerFailure } from "./planner-screen-model";
import styles from "./AssistantPlannerScreen.module.css";

export function PlannerOfflineBanner() {
  return (
    <div className={styles.banner} data-tone="warning" role="status">
      <WifiOff size={19} aria-hidden="true" />
      <div>
        <strong>Planner actions are unavailable offline</strong>
        <span>
          Loaded input and proposal details remain visible. Reconnect to create or apply a proposal.
        </span>
      </div>
    </div>
  );
}

export function PlannerFailureBanner({
  failure,
  onRetry,
  onEditInput,
  retryDisabled = false,
}: Readonly<{
  failure: PlannerFailure;
  onRetry: () => void;
  onEditInput?: (() => void) | undefined;
  retryDisabled?: boolean;
}>) {
  const content = failureContent(failure);
  return (
    <div className={styles.banner} data-tone="danger" role="alert">
      <AlertTriangle size={19} aria-hidden="true" />
      <div>
        <strong>{content.title}</strong>
        <span>{content.message}</span>
      </div>
      <div className={styles.bannerActions}>
        {onEditInput ? (
          <Button type="button" variant="secondary" onClick={onEditInput}>
            Edit input
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={retryDisabled} onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> Retry
        </Button>
      </div>
    </div>
  );
}

export function PlannerUnavailableState({
  todayHref,
  calendarHref,
}: Readonly<{ todayHref: string; calendarHref: string }>) {
  return (
    <section className={styles.centeredState} aria-labelledby="planner-unavailable-heading">
      <KeyRound size={25} aria-hidden="true" />
      <p className="eyebrow">Optional planner</p>
      <h2 id="planner-unavailable-heading">Planning is unavailable because no AI key is configured</h2>
      <p>
        Manual task and calendar planning remain fully available. An administrator can configure the server
        later.
      </p>
      <div className={styles.stateActions}>
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

export function PlannerPermissionState() {
  return (
    <section className={styles.centeredState} aria-labelledby="planner-permission-heading">
      <ShieldAlert size={25} aria-hidden="true" />
      <p className="eyebrow">Private workspace</p>
      <h2 id="planner-permission-heading">This planning proposal is unavailable</h2>
      <p>Sign in again to continue. No task or proposal details are shown on this page.</p>
      <Button asChild variant="secondary">
        <Link href="/sign-in">Go to sign in</Link>
      </Button>
    </section>
  );
}
