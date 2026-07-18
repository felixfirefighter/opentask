"use client";

import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/shared/presentation";

import styles from "./OfflineBanner.module.css";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className={styles.offlineBanner} role="status" aria-live="polite">
      <WifiOff size={18} aria-hidden="true" />
      <span>You’re offline. Writes are disabled until you reconnect.</span>
    </div>
  );
}
