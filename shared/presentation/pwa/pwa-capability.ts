export type PwaRegistrationState = "checking" | "ready" | "unsupported" | "error";
export type PwaInstallState = "checking" | "available" | "installing" | "installed" | "manual";
export type PwaUpdateState = "current" | "available" | "reload-required" | "applying";

export type PwaCapability = Readonly<{
  registration: PwaRegistrationState;
  install: PwaInstallState;
  update: PwaUpdateState;
  message: string;
  installApp(): Promise<void>;
  updateAndReload(): Promise<void>;
  retrySetup(): void;
}>;

export type InstallPromptEvent = Event &
  Readonly<{
    prompt(): Promise<void>;
    userChoice: Promise<Readonly<{ outcome: "accepted" | "dismissed"; platform: string }>>;
  }>;

export const unsupportedPwaCapability: PwaCapability = {
  registration: "unsupported",
  install: "manual",
  update: "current",
  message: "This browser does not expose app installation controls. OpenTask still works in a browser tab.",
  installApp: async () => undefined,
  updateAndReload: async () => undefined,
  retrySetup: () => undefined,
};

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & Readonly<{ standalone?: boolean }>;
  return (
    window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true
  );
}
