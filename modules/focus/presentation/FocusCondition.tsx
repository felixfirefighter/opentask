import { AlertCircle, RefreshCw, ShieldAlert, TimerReset, WifiOff } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/presentation";

import type { FocusActiveView } from "./focus-screen-model";
import styles from "./FocusCondition.module.css";

export function FocusConditionBanner({
  active,
  onRetry,
}: Readonly<{ active: FocusActiveView; onRetry: () => void }>) {
  if (active.kind === "offline") {
    return (
      <div className={styles.banner} data-tone="warning" role="status">
        <WifiOff size={18} aria-hidden="true" />
        <div>
          <strong>Focus is read-only</strong>
          <span>Not connected; timer may still be running. No projected time will be saved offline.</span>
        </div>
      </div>
    );
  }
  if (
    active.kind !== "reconnect" &&
    active.kind !== "conflict" &&
    active.kind !== "mutation-error" &&
    active.kind !== "read-stale"
  ) {
    return null;
  }
  const conflict = active.kind === "conflict";
  const failedMutation = active.kind === "mutation-error";
  const failedRead = active.kind === "read-stale";
  return (
    <div
      className={styles.banner}
      data-tone={failedMutation || failedRead ? "danger" : "info"}
      role={failedMutation || failedRead ? "alert" : undefined}
    >
      {failedMutation || failedRead ? (
        <AlertCircle size={18} aria-hidden="true" />
      ) : (
        <TimerReset size={18} aria-hidden="true" />
      )}
      <div>
        <strong>
          {failedMutation
            ? "Timer change was not confirmed"
            : failedRead
              ? "Timer refresh failed"
              : conflict
                ? "Authoritative timer recovered"
                : "Timer reconnected"}
        </strong>
        <span>{active.message}</span>
      </div>
      {failedMutation || failedRead ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> {failedRead ? "Retry timer" : "Refresh timer"}
        </Button>
      ) : null}
    </div>
  );
}

export function FocusPermissionState() {
  return (
    <section className={styles.state} aria-labelledby="focus-permission-heading">
      <ShieldAlert size={24} aria-hidden="true" />
      <h2 id="focus-permission-heading">Focus is unavailable</h2>
      <p>Sign in again to use your timer and private Focus history.</p>
      <Button asChild variant="secondary">
        <Link href="/sign-in">Go to sign in</Link>
      </Button>
    </section>
  );
}

export function FocusActiveReadError({
  message,
  onRetry,
}: Readonly<{ message: string; onRetry: () => void }>) {
  return (
    <section className={styles.state} aria-labelledby="focus-read-error-heading">
      <AlertCircle size={24} aria-hidden="true" />
      <h2 id="focus-read-error-heading">Timer state is unavailable</h2>
      <p>{message} Starting is disabled until the authoritative timer can be checked.</p>
      <Button type="button" variant="secondary" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden="true" /> Retry timer
      </Button>
    </section>
  );
}

export function FocusTimerLoading() {
  return (
    <section className={styles.loading} aria-labelledby="focus-loading-heading" aria-busy="true">
      <div className={styles.loadingHeader} aria-hidden="true">
        <span />
        <span />
      </div>
      <h2 className="sr-only" id="focus-loading-heading">
        Focus timer
      </h2>
      <p className="sr-only" role="status">
        Loading authoritative timer state
      </p>
      <span className={styles.loadingMode} aria-hidden="true" />
      <span className={styles.loadingTime} aria-hidden="true" />
      <span className={styles.loadingControl} aria-hidden="true" />
    </section>
  );
}

export function FocusTransitionAnnouncement({ announcement }: Readonly<{ announcement: string | null }>) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement ?? ""}
    </p>
  );
}
