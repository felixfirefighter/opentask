"use client";

import { useSyncExternalStore } from "react";

export function useOnlineStatus() {
  return useSyncExternalStore(subscribeToConnectivity, readConnectivity, readServerConnectivity);
}

function subscribeToConnectivity(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);

  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function readConnectivity() {
  return navigator.onLine;
}

function readServerConnectivity() {
  return true;
}
