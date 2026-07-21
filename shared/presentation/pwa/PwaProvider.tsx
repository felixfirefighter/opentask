"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { confirmUnsavedNavigation } from "../unsaved-navigation";
import { useConnectivityStatus } from "../useOnlineStatus";
import {
  isStandaloneDisplay,
  unsupportedPwaCapability,
  type InstallPromptEvent,
  type PwaCapability,
  type PwaInstallState,
  type PwaRegistrationState,
  type PwaUpdateState,
} from "./pwa-capability";
import {
  activateWaitingServiceWorker,
  checkForServiceWorkerUpdate,
  currentOpenTaskBuildVersion,
  observeOpenTaskServiceWorker,
  reloadOpenTaskPage,
  repairStaticShell,
  serviceWorkersSupported,
} from "./service-worker-registration";

const PwaContext = createContext<PwaCapability>(unsupportedPwaCapability);

export function PwaProvider({ children }: Readonly<{ children: ReactNode }>) {
  const connectivity = useConnectivityStatus();
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const installPromptRef = useRef<InstallPromptEvent | null>(null);
  const reloadArmed = useRef(false);
  const reloadStarted = useRef(false);
  const activationTimeout = useRef<number | null>(null);
  const [registrationAttempt, setRegistrationAttempt] = useState(0);
  const [registration, setRegistration] = useState<PwaRegistrationState>("checking");
  const [install, setInstall] = useState<PwaInstallState>("checking");
  const [update, setUpdate] = useState<PwaUpdateState>("current");
  const [message, setMessage] = useState("Checking browser app support…");

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      const promptEvent = event as InstallPromptEvent;
      promptEvent.preventDefault();
      installPromptRef.current = promptEvent;
      setInstall("available");
      setMessage("OpenTask is ready to install on this device.");
    }

    function handleInstalled() {
      installPromptRef.current = null;
      setInstall("installed");
      setMessage("OpenTask is installed on this device.");
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    let dispose: () => void = () => undefined;
    let cancelled = false;

    if (!serviceWorkersSupported()) {
      const standalone = isStandaloneDisplay();
      queueMicrotask(() => {
        if (cancelled) return;
        setRegistration("unsupported");
        setInstall(standalone ? "installed" : "manual");
        setMessage(
          standalone
            ? "OpenTask is running as an installed app."
            : "This browser does not support the OpenTask app shell. Browser use remains available.",
        );
      });
      return () => {
        cancelled = true;
      };
    }

    void observeOpenTaskServiceWorker({
      onControllerChange() {
        if (!reloadArmed.current || reloadStarted.current) return;
        reloadStarted.current = true;
        if (activationTimeout.current !== null) window.clearTimeout(activationTimeout.current);
        reloadOpenTaskPage();
      },
      onReady(nextRegistration) {
        if (cancelled) return;
        registrationRef.current = nextRegistration;
        setRegistration("ready");
        setInstall((current) => {
          if (isStandaloneDisplay()) return "installed";
          return current === "available" ? current : "manual";
        });
        setMessage(
          isStandaloneDisplay()
            ? "OpenTask is installed on this device."
            : "The app shell is ready. Install from your browser when that option is offered.",
        );
        void repairStaticShell(nextRegistration);
      },
      onRegistrationError() {
        if (cancelled) return;
        registrationRef.current = null;
        setRegistration("error");
        setInstall("manual");
        setMessage("App setup could not finish. Online OpenTask remains available; retry when ready.");
      },
      onUpdateActivated(version) {
        if (cancelled || reloadArmed.current || version === currentOpenTaskBuildVersion) {
          return;
        }
        setUpdate("reload-required");
        setMessage("Another OpenTask tab applied an update. Reload when your drafts are safe.");
      },
      onUpdateAvailable(nextRegistration) {
        if (cancelled) return;
        registrationRef.current = nextRegistration;
        setUpdate("available");
        setMessage("An OpenTask update is ready. Reload when your drafts are safe.");
      },
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else dispose = cleanup;
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [registrationAttempt]);

  useEffect(() => {
    if (connectivity !== "online" || !registrationRef.current) return;
    const current = registrationRef.current;
    void repairStaticShell(current);
    void checkForServiceWorkerUpdate(current)
      .then((waiting) => {
        if (waiting) {
          setUpdate("available");
          setMessage("An OpenTask update is ready. Reload when your drafts are safe.");
        }
      })
      .catch(() => undefined);
  }, [connectivity]);

  useEffect(
    () => () => {
      if (activationTimeout.current !== null) window.clearTimeout(activationTimeout.current);
    },
    [],
  );

  const installApp = useCallback(async () => {
    const prompt = installPromptRef.current;
    if (!prompt || install === "installing") return;
    setInstall("installing");
    setMessage("Waiting for your browser’s install choice…");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      installPromptRef.current = null;
      if (choice.outcome === "accepted") {
        setInstall("installed");
        setMessage("OpenTask was installed on this device.");
      } else {
        setInstall("manual");
        setMessage("Installation was dismissed. You can install later from your browser menu.");
      }
    } catch {
      installPromptRef.current = null;
      setInstall("manual");
      setMessage("The browser did not complete installation. Online OpenTask is unchanged.");
    }
  }, [install]);

  const updateAndReload = useCallback(async () => {
    if (connectivity !== "online" || update === "applying") return;
    if (!confirmUnsavedNavigation()) {
      setMessage("Update postponed so your draft stays available.");
      return;
    }

    if (update === "reload-required") {
      reloadStarted.current = true;
      setUpdate("applying");
      setMessage("Reloading the updated OpenTask app…");
      reloadOpenTaskPage();
      return;
    }

    const current = registrationRef.current;
    if (!current) {
      setRegistration("error");
      setMessage("The update could not be prepared. Retry app setup.");
      return;
    }

    try {
      if (!current.waiting) await checkForServiceWorkerUpdate(current);
      reloadArmed.current = true;
      reloadStarted.current = false;
      setUpdate("applying");
      setMessage("Updating OpenTask…");
      if (!activateWaitingServiceWorker(current)) throw new Error("No waiting worker");
      activationTimeout.current = window.setTimeout(() => {
        reloadArmed.current = false;
        setUpdate("available");
        setMessage("The update did not activate. Try again.");
      }, 12_000);
    } catch {
      reloadArmed.current = false;
      setUpdate("available");
      setMessage("The update could not activate. Try again.");
    }
  }, [connectivity, update]);

  const retrySetup = useCallback(() => {
    registrationRef.current = null;
    setRegistration("checking");
    setMessage("Retrying app setup…");
    setRegistrationAttempt((current) => current + 1);
  }, []);

  const value: PwaCapability = {
    registration,
    install,
    update,
    message,
    installApp,
    updateAndReload,
    retrySetup,
  };

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwaCapability() {
  return useContext(PwaContext);
}
