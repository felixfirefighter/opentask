"use client";

import { Bell, BellOff, RefreshCw, RotateCcw } from "lucide-react";

import styles from "./PushSettingsPanel.module.css";
import { usePushSettingsController } from "./use-push-settings-controller";

export function PushSettingsPanel() {
  const controller = usePushSettingsController();
  const presentation = describePushState(controller);
  const canEnable =
    controller.online &&
    !controller.pending &&
    controller.browser.support === "supported" &&
    controller.browser.permission !== "denied" &&
    !controller.browserCheckError &&
    presentation.configured;

  return (
    <div className={styles.panel} aria-labelledby="push-reminders-title">
      <div className={styles.heading}>
        <div>
          <h3 id="push-reminders-title">Task reminders</h3>
          <p>{presentation.description}</p>
        </div>
        <span className={styles.status} data-state={presentation.tone} role="status">
          <presentation.Icon size={16} aria-hidden="true" />
          {presentation.label}
        </span>
      </div>

      {controller.capability.data?.worker === "configured_unverified" ? (
        <p className={styles.note}>
          The worker is configured, but this page cannot verify that it is running.
        </p>
      ) : null}

      <div className={styles.actions}>
        <p className={styles.feedback} aria-live="polite">
          {!controller.online
            ? "Reconnect before changing this browser’s reminder access."
            : controller.message}
        </p>
        {controller.browserCheckError ? (
          <button
            type="button"
            className="secondary-button"
            disabled={!controller.online}
            onClick={() => void controller.refreshBrowser()}
          >
            <RefreshCw size={16} aria-hidden="true" /> Retry browser status
          </button>
        ) : controller.capability.isError ? (
          <button
            type="button"
            className="secondary-button"
            disabled={!controller.online || controller.capability.isFetching}
            onClick={() => void controller.capability.refetch()}
          >
            <RefreshCw size={16} aria-hidden="true" /> Retry status
          </button>
        ) : controller.browser.subscription ? (
          <div className={styles.buttonGroup}>
            {controller.resetRequired ? (
              <button
                type="button"
                className="secondary-button"
                disabled={!canEnable}
                onClick={() => void controller.enable(true)}
              >
                <RotateCcw size={16} aria-hidden="true" /> Reset this browser subscription
              </button>
            ) : controller.enrollment === "unverified" ? (
              <button
                type="button"
                className="secondary-button"
                disabled={!canEnable}
                onClick={() => void controller.enable()}
              >
                <RefreshCw size={16} aria-hidden="true" /> Verify this browser
              </button>
            ) : null}
            <button
              type="button"
              className="quiet-button"
              disabled={!controller.online || controller.pending}
              onClick={() => void controller.disable()}
            >
              <BellOff size={16} aria-hidden="true" /> Turn off in this browser
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={!canEnable}
            onClick={() => void controller.enable()}
          >
            <Bell size={16} aria-hidden="true" /> Enable in this browser
          </button>
        )}
      </div>
    </div>
  );
}

function describePushState(controller: ReturnType<typeof usePushSettingsController>) {
  const capability = controller.capability.data;
  if (controller.capability.isPending || !controller.browserChecked) {
    return state(
      RefreshCw,
      "Checking",
      "Checking browser and server reminder capability.",
      "disabled",
      false,
    );
  }
  if (controller.capability.isError) {
    return state(RefreshCw, "Status unavailable", "Reminder status could not be loaded.", "warning", false);
  }
  if (controller.browserCheckError) {
    return state(
      RefreshCw,
      "Browser status unavailable",
      "This browser’s reminder status could not be checked.",
      "warning",
      false,
    );
  }
  if (controller.browser.support === "unsupported") {
    return state(
      BellOff,
      "Unsupported",
      "This browser does not support Web Push reminders.",
      "disabled",
      false,
    );
  }
  if (
    !capability ||
    capability.provider === "unconfigured" ||
    capability.storageEncryption === "unconfigured"
  ) {
    return state(
      BellOff,
      "Unavailable",
      "This server has not configured browser reminders.",
      "disabled",
      false,
    );
  }
  if (capability.worker === "known_disabled") {
    return state(BellOff, "Worker off", "The reminder worker is intentionally disabled.", "warning", false);
  }
  if (capability.worker === "unconfigured") {
    return state(
      BellOff,
      "Worker unconfigured",
      "This server has not declared whether the reminder worker is enabled.",
      "warning",
      false,
    );
  }
  if (controller.browser.permission === "denied") {
    return state(
      BellOff,
      "Permission blocked",
      "Allow notifications in browser site settings to continue.",
      "warning",
      true,
    );
  }
  if (controller.resetRequired) {
    return state(
      RotateCcw,
      "Reset needed",
      "This browser subscription is already associated elsewhere.",
      "warning",
      true,
    );
  }
  if (controller.browser.subscription && controller.enrollment === "enrolled") {
    return state(Bell, "Enabled", "This browser can receive your saved task reminders.", "available", true);
  }
  if (controller.browser.subscription) {
    return state(
      RefreshCw,
      "Verification needed",
      "A local browser subscription exists, but its association with this account is not verified.",
      "warning",
      true,
    );
  }
  return state(
    BellOff,
    "Not enabled",
    "Permission is requested only when you use the enable control.",
    "disabled",
    true,
  );
}

function state(
  Icon: typeof Bell,
  label: string,
  description: string,
  tone: "available" | "disabled" | "warning",
  configured: boolean,
) {
  return { Icon, label, description, tone, configured } as const;
}
