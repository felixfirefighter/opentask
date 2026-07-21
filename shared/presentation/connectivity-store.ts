"use client";

export type ConnectivityStatus = "online" | "browser-offline" | "network-unreachable" | "recovering";

const listeners = new Set<() => void>();
const connectivityProbeTimeoutMs = 8_000;
let status: ConnectivityStatus = "online";
let monitoring = false;
let probe: Promise<boolean> | null = null;
let probeAbortController: AbortController | null = null;

export function subscribeToConnectivity(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (!monitoring) startMonitoring();

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) stopMonitoring();
  };
}

export function readConnectivityStatus() {
  return status;
}

export function readServerConnectivityStatus(): ConnectivityStatus {
  return "online";
}

export function reportConnectivityResponse() {
  setStatus("online");
}

export function reportConnectivityFailure(error: unknown) {
  if (isAbortError(error)) return;
  setStatus(browserIsOffline() ? "browser-offline" : "network-unreachable");
}

export function retryConnectivity() {
  if (probe) return probe;
  if (browserIsOffline()) {
    setStatus("browser-offline");
    return Promise.resolve(false);
  }

  setStatus("recovering");
  const abortController = new AbortController();
  probeAbortController = abortController;
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<Response>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TypeError("Connectivity probe timed out."));
      abortController.abort();
    }, connectivityProbeTimeoutMs);
  });
  const request = fetch("/api/health/live", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal: abortController.signal,
  });
  const currentProbe = Promise.race([request, timeout])
    .then(() => {
      setStatus("online");
      return true;
    })
    .catch((error: unknown) => {
      reportConnectivityFailure(error);
      return false;
    })
    .finally(() => {
      clearTimeout(timeoutId);
      if (probe === currentProbe) {
        probe = null;
        probeAbortController = null;
      }
    });
  probe = currentProbe;
  return currentProbe;
}

export function resetConnectivityStateForTests() {
  probeAbortController?.abort();
  probeAbortController = null;
  probe = null;
  status = "online";
}

function startMonitoring() {
  monitoring = true;
  window.addEventListener("offline", handleBrowserOffline);
  window.addEventListener("online", handleBrowserOnline);
  window.addEventListener("focus", handleWindowFocus);
  if (browserIsOffline()) setStatus("browser-offline");
}

function stopMonitoring() {
  monitoring = false;
  window.removeEventListener("offline", handleBrowserOffline);
  window.removeEventListener("online", handleBrowserOnline);
  window.removeEventListener("focus", handleWindowFocus);
}

function handleBrowserOffline() {
  setStatus("browser-offline");
}

function handleBrowserOnline() {
  void retryConnectivity();
}

function handleWindowFocus() {
  if (status !== "online") void retryConnectivity();
}

function browserIsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function setStatus(next: ConnectivityStatus) {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}
