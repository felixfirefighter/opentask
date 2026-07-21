"use client";

import { CircleCheck, CircleOff, Download, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { useOnlineStatus, usePwaCapability } from "@/shared/presentation";

import styles from "./SettingsScreen.module.css";

export function PwaSettingsCard({ reminderControls }: Readonly<{ reminderControls?: ReactNode }>) {
  const online = useOnlineStatus();
  const pwa = usePwaCapability();
  const presentation = describeCapability(pwa);
  const installing = pwa.install === "installing";
  const applying = pwa.update === "applying";
  const updateReady = pwa.update === "available" || pwa.update === "reload-required";
  const shellReady = pwa.registration === "ready";

  return (
    <section className={styles.card} aria-labelledby="pwa-title">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">This browser</p>
          <h2 id="pwa-title">{reminderControls ? "App and reminders" : "App"}</h2>
        </div>
        <span className={styles.capabilityStatus} data-state={presentation.tone} role="status">
          <presentation.Icon size={16} aria-hidden="true" />
          {presentation.label}
        </span>
      </div>

      <p className={styles.cardDescription}>{describeShell(pwa)}</p>
      {shellReady ? (
        <ul className={styles.appFacts}>
          <li>Already loaded pages stay visible and read-only if the connection drops.</li>
          <li>A cold offline open shows only a content-free fallback with no account or task data.</li>
        </ul>
      ) : null}

      <div className={styles.cardActions}>
        <p className={styles.saveStatus} aria-live="polite">
          {!online && (pwa.install === "available" || updateReady)
            ? "Reconnect before installing or applying an update."
            : pwa.message}
        </p>
        {updateReady || applying ? (
          <button
            type="button"
            className="primary-button"
            disabled={!online || applying}
            onClick={() => void pwa.updateAndReload()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {applying ? "Updating…" : "Update and reload"}
          </button>
        ) : pwa.install === "available" || installing ? (
          <button
            type="button"
            className="primary-button"
            disabled={!online || installing}
            onClick={() => void pwa.installApp()}
          >
            <Download size={16} aria-hidden="true" />
            {installing ? "Opening browser prompt…" : "Install OpenTask"}
          </button>
        ) : pwa.registration === "error" ? (
          <button type="button" className="secondary-button" disabled={!online} onClick={pwa.retrySetup}>
            Retry setup
          </button>
        ) : null}
      </div>
      {reminderControls}
    </section>
  );
}

function describeCapability(pwa: ReturnType<typeof usePwaCapability>) {
  if (pwa.update === "applying") {
    return { Icon: RefreshCw, label: "Updating", tone: "info" } as const;
  }
  if (pwa.update === "available" || pwa.update === "reload-required") {
    return { Icon: RefreshCw, label: "Update ready", tone: "info" } as const;
  }
  if (pwa.registration === "checking") {
    return { Icon: RefreshCw, label: "Checking", tone: "disabled" } as const;
  }
  if (pwa.registration === "error") {
    return { Icon: CircleOff, label: "Setup issue", tone: "warning" } as const;
  }
  if (pwa.registration === "unsupported") {
    return { Icon: CircleOff, label: "Browser only", tone: "disabled" } as const;
  }
  if (pwa.install === "installed") {
    return { Icon: CircleCheck, label: "Installed", tone: "available" } as const;
  }
  if (pwa.install === "available" || pwa.install === "installing") {
    return { Icon: Download, label: "Ready to install", tone: "info" } as const;
  }
  return { Icon: CircleCheck, label: "App shell ready", tone: "available" } as const;
}

function describeShell(pwa: ReturnType<typeof usePwaCapability>) {
  if (pwa.registration === "unsupported") {
    return "This browser can use OpenTask online, but it does not support the installable app shell.";
  }
  if (pwa.registration === "error") {
    return "OpenTask remains available online, but this browser’s app shell did not finish setup.";
  }
  if (pwa.registration === "checking") {
    return "Checking whether this browser can install and maintain the OpenTask app shell.";
  }
  return "Installation opens OpenTask in its own window. It does not store your tasks for offline editing.";
}
