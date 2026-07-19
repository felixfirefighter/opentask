import { AlertCircle, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/shared/presentation";

import type { PlanningScreenCondition } from "./planning-screen-model";
import styles from "./PlanningCondition.module.css";

type PlanningConditionBannerProps = Readonly<{
  condition: PlanningScreenCondition;
  onRetry?: (() => void) | undefined;
  onReturnToToday?: (() => void) | undefined;
}>;

export function PlanningConditionBanner({
  condition,
  onRetry,
  onReturnToToday,
}: PlanningConditionBannerProps) {
  if (condition.kind === "ready" || condition.kind === "loading" || condition.kind === "permission") {
    return null;
  }

  const content = conditionContent(condition);
  return (
    <div
      className={styles.banner}
      data-tone={content.tone}
      role={condition.kind === "error" || condition.kind === "conflict" ? "alert" : "status"}
    >
      <span className={styles.icon}>{content.icon}</span>
      <div className={styles.message}>
        <strong>{content.title}</strong>
        <span>{content.message}</span>
      </div>
      {condition.kind === "error" && onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> Retry
        </Button>
      ) : null}
      {condition.kind === "date-changed" && onReturnToToday ? (
        <Button type="button" variant="secondary" onClick={onReturnToToday}>
          Return to Today
        </Button>
      ) : null}
    </div>
  );
}

export function PermissionState() {
  return (
    <section className={styles.statePanel} aria-labelledby="planning-unavailable-heading">
      <ShieldAlert size={24} aria-hidden="true" />
      <h2 id="planning-unavailable-heading">This planning view is unavailable</h2>
      <p>Sign in again or return to a planning destination you can access.</p>
      <Button asChild variant="secondary">
        <Link href="/sign-in">Go to sign in</Link>
      </Button>
    </section>
  );
}

export function UnavailableDataState({
  title,
  message = "No result is shown as current until this projection can be refreshed.",
}: Readonly<{ title: string; message?: string | undefined }>) {
  return (
    <section className={styles.statePanel} aria-labelledby="planning-data-unavailable-heading">
      <AlertCircle size={24} aria-hidden="true" />
      <h2 id="planning-data-unavailable-heading">{title}</h2>
      <p>{message}</p>
    </section>
  );
}

export function LoadingRows({ label = "Loading planning tasks" }: Readonly<{ label?: string }>) {
  return (
    <div className={styles.skeleton}>
      <div aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="sr-only" role="status">
        {label}
      </p>
    </div>
  );
}

function conditionContent(
  condition: Exclude<PlanningScreenCondition, { kind: "ready" | "loading" | "permission" }>,
): {
  icon: ReactNode;
  title: string;
  message: string;
  tone: "danger" | "warning" | "info";
} {
  if (condition.kind === "offline") {
    return {
      icon: <WifiOff size={18} aria-hidden="true" />,
      title: "Planning is read-only",
      message: "Reconnect to add, complete, move, or reschedule tasks. Loaded tasks remain visible.",
      tone: "warning",
    };
  }
  if (condition.kind === "conflict") {
    return {
      icon: <AlertCircle size={18} aria-hidden="true" />,
      title: "A task changed elsewhere",
      message: condition.message ?? "The latest saved values are shown. Open the task before trying again.",
      tone: "warning",
    };
  }
  if (condition.kind === "date-changed") {
    return {
      icon: <RefreshCw size={18} aria-hidden="true" />,
      title: `Today is now ${condition.currentDateLabel}`,
      message: "Your typed quick-add text is still here. Return when you are ready to refresh the date.",
      tone: "info",
    };
  }
  return {
    icon: <AlertCircle size={18} aria-hidden="true" />,
    title: "Planning could not be refreshed",
    message: condition.message ?? "Loaded tasks may be out of date. Nothing was changed.",
    tone: "danger",
  };
}
