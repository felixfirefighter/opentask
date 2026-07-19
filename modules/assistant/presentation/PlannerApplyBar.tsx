import { Check, RotateCcw, X } from "lucide-react";

import { Button } from "@/shared/presentation";

import styles from "./PlannerReviewStep.module.css";

export function PlannerApplyBar({
  selectedCount,
  online,
  operation,
  onApply,
  onReject,
  onRevalidate,
}: Readonly<{
  selectedCount: number;
  online: boolean;
  operation: "idle" | "applying" | "rejecting" | "revalidating";
  onApply: () => void;
  onReject: () => void;
  onRevalidate: () => void;
}>) {
  const busy = operation !== "idle";
  return (
    <div className={styles.applyBar} aria-label="Apply proposal changes">
      <div>
        <strong>
          <Check size={16} aria-hidden="true" /> {selectedCount} selected
        </strong>
        <span>
          {!online
            ? "Reconnect to apply."
            : selectedCount === 0
              ? "Select at least one valid action."
              : "Atomic apply · nothing is saved yet"}
        </span>
      </div>
      <div className={styles.applyActions}>
        <Button type="button" variant="quiet" disabled={busy || !online} onClick={onReject}>
          <X size={16} aria-hidden="true" />{" "}
          {operation === "rejecting" ? "Rejecting proposal" : "Reject proposal"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy || !online} onClick={onRevalidate}>
          <RotateCcw size={16} aria-hidden="true" />
          {operation === "revalidating" ? "Revalidating" : "Revalidate"}
        </Button>
        <Button type="button" disabled={busy || !online || selectedCount === 0} onClick={onApply}>
          {operation === "applying"
            ? `Applying ${selectedCount} changes`
            : `Apply ${selectedCount} ${selectedCount === 1 ? "change" : "changes"}`}
        </Button>
      </div>
    </div>
  );
}
