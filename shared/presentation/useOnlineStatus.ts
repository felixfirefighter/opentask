"use client";

import { useSyncExternalStore } from "react";

import {
  readConnectivityStatus,
  readServerConnectivityStatus,
  subscribeToConnectivity,
  type ConnectivityStatus,
} from "./connectivity-store";

export function useOnlineStatus() {
  return useConnectivityStatus() === "online";
}

export function useConnectivityStatus(): ConnectivityStatus {
  return useSyncExternalStore(subscribeToConnectivity, readConnectivityStatus, readServerConnectivityStatus);
}
