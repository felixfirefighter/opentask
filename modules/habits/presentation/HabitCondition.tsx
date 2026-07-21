import { AlertCircle, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/presentation";

import type { HabitScreenCondition } from "./habit-screen-model";
import styles from "./HabitCondition.module.css";

export function HabitConditionBanner({
  condition,
  onReviewLatest,
  onRetry,
}: Readonly<{
  condition: HabitScreenCondition;
  onReviewLatest?: () => void;
  onRetry?: () => void;
}>) {
  if (condition.kind === "ready" || condition.kind === "loading" || condition.kind === "permission") {
    return null;
  }
  const content = conditionContent(condition);
  return (
    <div className={styles.banner} data-tone={content.tone} role={content.role}>
      <span className={styles.icon}>{content.icon}</span>
      <div className={styles.message}>
        <strong>{content.title}</strong>
        <span>{content.message}</span>
      </div>
      {condition.kind === "conflict" && onReviewLatest ? (
        <Button type="button" variant="secondary" onClick={onReviewLatest}>
          Review latest
        </Button>
      ) : null}
      {(condition.kind === "error" || condition.kind === "conflict") && onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> Retry
        </Button>
      ) : null}
    </div>
  );
}

export function HabitPermissionState({ page = false }: Readonly<{ page?: boolean }>) {
  return (
    <section className={styles.state} aria-labelledby="habit-permission-heading">
      <ShieldAlert size={24} aria-hidden="true" />
      {page ? (
        <h1 id="habit-permission-heading" tabIndex={-1} data-route-focus>
          This habit view is unavailable
        </h1>
      ) : (
        <h2 id="habit-permission-heading">This habit view is unavailable</h2>
      )}
      <p>Sign in again or return to a habit you can access.</p>
      <Button asChild variant="secondary">
        <Link href="/sign-in">Go to sign in</Link>
      </Button>
    </section>
  );
}

export function HabitLoadingRows({ label = "Loading habits" }: Readonly<{ label?: string }>) {
  return (
    <div className={styles.loading} aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      {[0, 1, 2].map((row) => (
        <span aria-hidden="true" key={row} />
      ))}
    </div>
  );
}

export function HabitHistoryLoading() {
  return (
    <div className={styles.historyLoading} aria-busy="true">
      <p role="status">Loading habit history</p>
      <span aria-hidden="true" />
    </div>
  );
}

function conditionContent(
  condition: Exclude<HabitScreenCondition, { kind: "ready" | "loading" | "permission" }>,
) {
  if (condition.kind === "offline") {
    return {
      icon: <WifiOff size={18} aria-hidden="true" />,
      title: "Habits are read-only",
      message: "Loaded habits remain visible. Reconnect before creating, editing, or checking in.",
      tone: "warning" as const,
      role: "status" as const,
    };
  }
  if (condition.kind === "conflict") {
    return {
      icon: <AlertCircle size={18} aria-hidden="true" />,
      title: "This habit changed elsewhere",
      message: condition.message,
      tone: "warning" as const,
      role: "alert" as const,
    };
  }
  return {
    icon: <AlertCircle size={18} aria-hidden="true" />,
    title: "Habits could not be refreshed",
    message: condition.message,
    tone: "danger" as const,
    role: "alert" as const,
  };
}
