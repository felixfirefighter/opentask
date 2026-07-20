import { CircleCheck, CircleOff, Sparkles } from "lucide-react";
import Link from "next/link";

import styles from "./SettingsScreen.module.css";

export type OptionalAiCapability =
  Readonly<{ state: "available" }> | Readonly<{ state: "disabled"; reason: "missing_api_key" }>;

export function OptionalAiSettingsCard({ capability }: { capability: OptionalAiCapability }) {
  const available = capability.state === "available";

  return (
    <section className={styles.card} aria-labelledby="optional-ai-title">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">Planning support</p>
          <h2 id="optional-ai-title">Optional AI</h2>
        </div>
        <span
          className={styles.capabilityStatus}
          data-state={available ? "available" : "disabled"}
          role="status"
        >
          {available ? (
            <CircleCheck size={16} aria-hidden="true" />
          ) : (
            <CircleOff size={16} aria-hidden="true" />
          )}
          {available ? "Available" : "Not configured"}
        </span>
      </div>

      <p className={styles.cardDescription}>
        {available
          ? "AI Review can create a proposal for you to inspect before anything is applied. Manual task and calendar planning remain available at all times."
          : "No server-side AI provider is configured, so AI Review is unavailable. Manual task and calendar planning continue to work without it."}
      </p>

      <nav className={styles.capabilityLinks} aria-label="Planning options">
        {available ? (
          <Link className="secondary-button" href="/plan">
            <Sparkles size={16} aria-hidden="true" />
            Open AI Review
          </Link>
        ) : null}
        <Link className="secondary-button" href="/today">
          Plan manually in Today
        </Link>
        <Link className="secondary-button" href="/calendar">
          Open Calendar
        </Link>
      </nav>
    </section>
  );
}
