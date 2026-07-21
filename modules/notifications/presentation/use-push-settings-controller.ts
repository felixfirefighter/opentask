"use client";

import { useState } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import {
  browserSubscriptionEnrollment,
  requestBrowserPushSubscription,
  unsubscribeBrowserPush,
} from "./browser-push";
import {
  useRegisterPushSubscriptionMutation,
  useRevokePushSubscriptionMutation,
} from "./data/use-notification-mutations";
import { usePushCapabilityQuery } from "./data/use-notification-queries";
import { useBrowserPushEnrollment, useSetBrowserPushEnrollment } from "./data/use-browser-push-enrollment";
import { useBrowserPushStatus } from "./use-browser-push-status";

export function usePushSettingsController() {
  const online = useOnlineStatus();
  const capability = usePushCapabilityQuery();
  const register = useRegisterPushSubscriptionMutation();
  const revoke = useRevokePushSubscriptionMutation();
  const browserStatus = useBrowserPushStatus();
  const enrollment = useBrowserPushEnrollment();
  const setEnrollment = useSetBrowserPushEnrollment();
  const [message, setMessage] = useState("");

  async function refreshBrowser() {
    const refreshed = await browserStatus.refresh();
    if (refreshed) setEnrollment("unverified");
    setMessage(refreshed ? "" : "Browser reminder status could not be checked. Try again.");
  }

  async function enable(resetCurrent = false) {
    const server = capability.data;
    if (
      !server?.vapidPublicKey ||
      server.provider !== "configured" ||
      server.storageEncryption !== "configured"
    ) {
      setMessage("Browser reminders are not configured on this server.");
      return;
    }
    try {
      const verifyingExisting = !resetCurrent && browserStatus.snapshot.subscription !== null;
      setMessage(
        resetCurrent
          ? "Resetting this browser subscription…"
          : verifyingExisting
            ? "Verifying this browser subscription…"
            : "Requesting browser permission…",
      );
      const next = await requestBrowserPushSubscription(server.vapidPublicKey, resetCurrent);
      browserStatus.replace(next);
      setEnrollment("unverified");
      if (!next.subscription) {
        setMessage(
          next.permission === "denied"
            ? "Notifications are blocked in this browser’s site settings."
            : "Notification permission was not granted.",
        );
        return;
      }
      const result = await register.mutateAsync(browserSubscriptionEnrollment(next.subscription));
      setEnrollment(result.status === "subscribed" ? "enrolled" : "reset_required");
      setMessage(
        result.status === "subscribed"
          ? "Task reminders are enabled in this browser."
          : "Reset this browser subscription before associating it with this account.",
      );
    } catch {
      setEnrollment("unverified");
      setMessage(
        "This browser was not enrolled on the server. Browser permission may remain granted; retry safely.",
      );
    }
  }

  async function disable() {
    const current = browserStatus.snapshot.subscription;
    if (!current) return;
    setMessage("Turning off reminders in this browser…");
    try {
      await revoke.mutateAsync({ endpoint: current.endpoint });
    } catch {
      setMessage("The server could not revoke this browser. Its saved subscription remains unchanged.");
      return;
    }
    setEnrollment("unverified");
    try {
      await unsubscribeBrowserPush(current);
    } catch {
      setEnrollment("reset_required");
      setMessage(
        "Server delivery is off, but this browser could not remove its local subscription. Reset it before enabling again.",
      );
      return;
    }
    if (await browserStatus.refresh()) {
      setMessage("Task reminders are off in this browser.");
      return;
    }
    browserStatus.markUnsubscribed();
    setMessage("Task reminders are off. Browser status could not be refreshed.");
  }

  return {
    browser: browserStatus.snapshot,
    browserCheckError: browserStatus.error,
    browserChecked: browserStatus.checked,
    capability,
    enrollment,
    message,
    online,
    pending: register.isPending || revoke.isPending,
    resetRequired: enrollment === "reset_required",
    disable,
    enable,
    refreshBrowser,
  };
}
