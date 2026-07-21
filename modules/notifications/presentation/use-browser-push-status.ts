"use client";

import { useCallback, useEffect, useState } from "react";

import { inspectBrowserPush, type BrowserPushSnapshot } from "./browser-push";

const checkingSnapshot: BrowserPushSnapshot = {
  support: "supported",
  permission: "default",
  subscription: null,
};

export function useBrowserPushStatus() {
  const [snapshot, setSnapshot] = useState<BrowserPushSnapshot>(checkingSnapshot);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      setSnapshot(await inspectBrowserPush());
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void inspectBrowserPush().then(
      (next) => {
        if (cancelled) return;
        setSnapshot(next);
        setError(false);
        setChecked(true);
      },
      () => {
        if (cancelled) return;
        setError(true);
        setChecked(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    snapshot,
    checked,
    error,
    refresh,
    replace(next: BrowserPushSnapshot) {
      setSnapshot(next);
      setChecked(true);
      setError(false);
    },
    markUnsubscribed() {
      setSnapshot((current) => ({ ...current, subscription: null }));
    },
  } as const;
}
