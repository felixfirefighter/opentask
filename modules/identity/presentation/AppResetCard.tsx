"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import styles from "./AppResetCard.module.css";
import { clearAppLocalState } from "./profile-storage";

export function AppResetCard({
  navigate = (destination) => window.location.replace(destination),
}: {
  navigate?: (destination: string) => void;
}) {
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function reset() {
    if (!online || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("App reset failed");
      clearAppLocalState();
      navigate("/");
    } catch {
      setPending(false);
      setError("The app was not reset. Check your connection and try again.");
    }
  }

  return (
    <section className={styles.card} aria-labelledby="reset-app-title">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">Destructive action</p>
          <h2 id="reset-app-title">Reset app</h2>
        </div>
      </div>
      <p className={styles.description}>
        Delete this profile and all of its preferences, tasks, lists, schedules, tags, and AI proposals. The
        next launch will ask for a profile name again. Export your data first if you may need it later.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className="secondary-button"
          disabled={!online}
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          Reset app
        </button>
      </div>

      <AlertDialog.Root open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.overlay} />
          <AlertDialog.Content className={styles.dialog} aria-describedby="reset-app-description">
            <AlertDialog.Title className={styles.title}>Reset OpenTask?</AlertDialog.Title>
            <AlertDialog.Description className={styles.description} id="reset-app-description">
              This permanently removes the current profile and all workspace data. You cannot undo this
              action.
            </AlertDialog.Description>
            <div className={styles.dialogActions}>
              <AlertDialog.Cancel className={styles.cancelButton} disabled={pending}>
                Keep my data
              </AlertDialog.Cancel>
              <AlertDialog.Action
                className={styles.dangerButton}
                disabled={!online || pending}
                onClick={(event) => {
                  event.preventDefault();
                  void reset();
                }}
              >
                {pending ? "Resetting…" : "Reset app"}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
