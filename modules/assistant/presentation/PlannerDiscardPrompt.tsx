"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/shared/presentation";

import styles from "./PlannerReviewStep.module.css";

export function PlannerDiscardPrompt({
  onKeepReviewing,
  onDiscard,
}: Readonly<{
  onKeepReviewing: () => void;
  onDiscard: () => void;
}>) {
  const promptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.discardPrompt}
      role="alertdialog"
      aria-labelledby="discard-review-heading"
      tabIndex={-1}
      ref={promptRef}
    >
      <div>
        <strong id="discard-review-heading">Discard review edits?</strong>
        <span>Your proposal remains unchanged, but local selections and edits will be lost.</span>
      </div>
      <Button type="button" variant="quiet" onClick={onKeepReviewing}>
        Keep reviewing
      </Button>
      <Button type="button" variant="secondary" onClick={onDiscard}>
        Discard review edits
      </Button>
    </div>
  );
}
