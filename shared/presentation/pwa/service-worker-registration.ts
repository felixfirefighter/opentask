export type ServiceWorkerRegistrationObserver = Readonly<{
  onControllerChange(): void;
  onReady(registration: ServiceWorkerRegistration): void;
  onRegistrationError(): void;
  onUpdateActivated(version: string): void;
  onUpdateAvailable(registration: ServiceWorkerRegistration): void;
}>;

export const currentOpenTaskBuildVersion = process.env.NEXT_PUBLIC_OPENTASK_BUILD_VERSION ?? "development";
const serviceWorkerPath = `/sw.js?build=${encodeURIComponent(currentOpenTaskBuildVersion)}`;

export function serviceWorkersSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function observeOpenTaskServiceWorker(
  observer: ServiceWorkerRegistrationObserver,
): Promise<() => void> {
  if (!serviceWorkersSupported()) return () => undefined;

  const container = navigator.serviceWorker;
  const observedWorkers = new Map<ServiceWorker, () => void>();
  let disposed = false;
  let readyReported = false;
  let registration: ServiceWorkerRegistration | null = null;

  function observeWorker(worker: ServiceWorker | null) {
    if (!worker || observedWorkers.has(worker)) return;

    const handleStateChange = () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller && registration?.waiting) {
        observer.onUpdateAvailable(registration);
      }
      if (worker.state === "redundant" && !registration?.active) observer.onRegistrationError();
    };
    worker.addEventListener("statechange", handleStateChange);
    observedWorkers.set(worker, () => worker.removeEventListener("statechange", handleStateChange));
    handleStateChange();
  }

  const handleControllerChange = () => observer.onControllerChange();
  const handleMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { type?: unknown; version?: unknown } | null;
    if (
      message?.type === "OPENTASK_UPDATE_ACTIVATED" &&
      typeof message.version === "string" &&
      message.version.length > 0 &&
      message.version.length <= 80
    ) {
      observer.onUpdateActivated(message.version);
    }
  };
  container.addEventListener("controllerchange", handleControllerChange);
  container.addEventListener("message", handleMessage);

  try {
    registration = await container.register(serviceWorkerPath, {
      scope: "/",
      updateViaCache: "none",
    });
    if (disposed) return () => undefined;

    const handleUpdateFound = () => observeWorker(registration?.installing ?? null);
    registration.addEventListener("updatefound", handleUpdateFound);
    observeWorker(registration.installing);
    if (registration.waiting && container.controller) observer.onUpdateAvailable(registration);
    void container.ready
      .then((readyRegistration) => {
        if (disposed || readyReported) return;
        readyReported = true;
        registration = readyRegistration;
        observer.onReady(readyRegistration);
        if (readyRegistration.waiting && container.controller) {
          observer.onUpdateAvailable(readyRegistration);
        }
      })
      .catch(() => {
        if (!disposed) observer.onRegistrationError();
      });

    return () => {
      disposed = true;
      container.removeEventListener("controllerchange", handleControllerChange);
      container.removeEventListener("message", handleMessage);
      registration?.removeEventListener("updatefound", handleUpdateFound);
      for (const removeListener of observedWorkers.values()) removeListener();
      observedWorkers.clear();
    };
  } catch {
    container.removeEventListener("controllerchange", handleControllerChange);
    container.removeEventListener("message", handleMessage);
    if (!disposed) observer.onRegistrationError();
    return () => undefined;
  }
}

export async function checkForServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  await registration.update();
  return registration.waiting !== null;
}

export function activateWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  const waiting = registration.waiting;
  if (!waiting) return false;
  waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export function reloadOpenTaskPage() {
  window.location.reload();
}

export async function repairStaticShell(registration: ServiceWorkerRegistration) {
  const worker = registration.active ?? navigator.serviceWorker.controller;
  if (!worker || typeof MessageChannel === "undefined") return false;

  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(false), 5_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeout);
      const result = event.data as { ok?: unknown } | null;
      resolve(result?.ok === true);
    };
    worker.postMessage({ type: "REPAIR_STATIC_SHELL" }, [channel.port2]);
  });
}
