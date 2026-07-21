"use client";

import { CircleCheck, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { retryConnectivity, useConnectivityStatus } from "@/shared/presentation";

import styles from "./OfflineBanner.module.css";

export function OfflineBanner() {
  const connectivity = useConnectivityStatus();
  const previous = useRef(connectivity);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    const wasUnavailable = previous.current !== "online";
    previous.current = connectivity;
    if (connectivity !== "online") return;
    if (!wasUnavailable) return;
    const reveal = window.setTimeout(() => setRecovered(true), 0);
    const hide = window.setTimeout(() => setRecovered(false), 5_000);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(hide);
    };
  }, [connectivity]);

  if (connectivity === "online" && !recovered) return null;

  if (connectivity === "online") {
    return (
      <div className={`${styles.offlineBanner} ${styles.recovered}`} role="status" aria-live="polite">
        <CircleCheck size={18} aria-hidden="true" />
        <span>Connection restored. Writes are available again.</span>
      </div>
    );
  }

  const recovering = connectivity === "recovering";

  return (
    <div className={styles.offlineBanner} role="status" aria-live="polite">
      {recovering ? <RefreshCw size={18} aria-hidden="true" /> : <WifiOff size={18} aria-hidden="true" />}
      <span>
        {recovering
          ? "Checking your connection. Writes remain disabled."
          : connectivity === "network-unreachable"
            ? "OpenTask cannot reach the server. Loaded data may be stale, and writes are disabled."
            : "You’re offline. Writes are disabled until you reconnect. Loaded data may be stale."}
      </span>
      {connectivity === "network-unreachable" ? (
        <button type="button" className="secondary-button" onClick={() => void retryConnectivity()}>
          Try connection
        </button>
      ) : null}
    </div>
  );
}
