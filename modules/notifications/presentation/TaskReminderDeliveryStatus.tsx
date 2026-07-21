"use client";

import Link from "next/link";

import { usePushCapabilityQuery } from "./data/use-notification-queries";
import { useBrowserPushEnrollment } from "./data/use-browser-push-enrollment";
import styles from "./TaskReminderPanel.module.css";
import { useBrowserPushStatus } from "./use-browser-push-status";

export function TaskReminderDeliveryStatus({ online }: Readonly<{ online: boolean }>) {
  const capability = usePushCapabilityQuery();
  const browser = useBrowserPushStatus();
  const enrollment = useBrowserPushEnrollment();
  const state = describeDeliveryStatus({
    online,
    capability: capability.data,
    capabilityPending: capability.isPending,
    capabilityError: capability.isError,
    browser: browser.snapshot,
    browserChecked: browser.checked,
    browserError: browser.error,
    enrollment,
  });

  return (
    <p className={styles.deliveryStatus} role="status" data-state={state.tone}>
      {state.message} {state.settingsLink ? <Link href="/settings">Open Settings</Link> : null}
    </p>
  );
}

function describeDeliveryStatus(
  input: Readonly<{
    online: boolean;
    capability:
      | Readonly<{
          provider: "configured" | "unconfigured";
          storageEncryption: "configured" | "unconfigured";
          worker: "configured_unverified" | "known_disabled" | "unconfigured";
        }>
      | undefined;
    capabilityPending: boolean;
    capabilityError: boolean;
    browser: Readonly<{
      support: "supported" | "unsupported";
      permission: NotificationPermission | "unsupported";
      subscription: PushSubscription | null;
    }>;
    browserChecked: boolean;
    browserError: boolean;
    enrollment: "enrolled" | "reset_required" | "unverified";
  }>,
) {
  if (!input.online) {
    return status("Delivery status may be stale while offline. The saved reminder is unchanged.", "quiet");
  }
  if (input.capabilityPending || !input.browserChecked) {
    return status("Checking browser delivery access…", "quiet");
  }
  if (input.capabilityError || input.browserError || !input.capability) {
    return status("Delivery status is unavailable. The saved reminder is unchanged.", "warning", true);
  }
  if (input.capability.provider === "unconfigured" || input.capability.storageEncryption === "unconfigured") {
    return status(
      "This server cannot deliver browser reminders yet. The saved reminder remains available.",
      "warning",
    );
  }
  if (input.capability.worker === "known_disabled") {
    return status("The reminder worker is off. The saved reminder remains available.", "warning");
  }
  if (input.capability.worker === "unconfigured") {
    return status("The reminder worker is not configured. The saved reminder remains available.", "warning");
  }
  if (input.browser.support === "unsupported") {
    return status("This browser cannot receive Web Push reminders.", "warning");
  }
  if (input.browser.permission === "denied") {
    return status("Browser notification permission is blocked.", "warning", true);
  }
  if (!input.browser.subscription) {
    return status("This browser is not enrolled for delivery.", "quiet", true);
  }
  if (input.enrollment === "reset_required") {
    return status(
      "This browser subscription must be reset before it can be associated with this account.",
      "warning",
      true,
    );
  }
  if (input.enrollment !== "enrolled") {
    return status(
      "This browser has a local subscription, but its association with this account is not verified.",
      "warning",
      true,
    );
  }
  return status(
    "This browser is enrolled. Worker configuration is present, but runtime liveness is not verified.",
    "ready",
  );
}

function status(message: string, tone: "quiet" | "ready" | "warning", settingsLink = false) {
  return { message, tone, settingsLink } as const;
}
