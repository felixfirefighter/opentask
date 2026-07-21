"use client";

import { RefreshCw } from "lucide-react";

import { useOnlineStatus, usePwaCapability } from "@/shared/presentation";

import styles from "./PwaUpdateBanner.module.css";

export function PwaUpdateBanner() {
  const online = useOnlineStatus();
  const pwa = usePwaCapability();
  if (pwa.update === "current") return null;

  const applying = pwa.update === "applying";
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <RefreshCw size={18} aria-hidden="true" />
      <span>
        {applying
          ? "Updating OpenTask…"
          : online
            ? "An OpenTask update is ready."
            : "An update is ready and can be applied after you reconnect."}
      </span>
      {!applying ? (
        <button
          type="button"
          className="secondary-button"
          disabled={!online}
          onClick={() => void pwa.updateAndReload()}
        >
          Update and reload
        </button>
      ) : null}
    </div>
  );
}
