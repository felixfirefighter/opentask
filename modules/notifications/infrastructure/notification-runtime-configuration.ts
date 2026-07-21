import type { NotificationConfiguration } from "./notification-configuration";

export type NotificationRuntimeConfigurationAdapter = Readonly<{
  capability(): Readonly<{
    provider: "configured" | "unconfigured";
    storageEncryption: "configured" | "unconfigured";
    worker: "configured_unverified" | "known_disabled" | "unconfigured";
    vapidPublicKey: string | null;
  }>;
}>;

export function createNotificationRuntimeConfiguration(
  configuration: NotificationConfiguration,
): NotificationRuntimeConfigurationAdapter {
  const capability = {
    provider: configuration.vapid ? ("configured" as const) : ("unconfigured" as const),
    storageEncryption: configuration.subscriptionEncryption
      ? ("configured" as const)
      : ("unconfigured" as const),
    worker:
      configuration.workerMode === "enabled"
        ? ("configured_unverified" as const)
        : configuration.workerMode === "disabled"
          ? ("known_disabled" as const)
          : ("unconfigured" as const),
    vapidPublicKey: configuration.vapid?.publicKey ?? null,
  };

  return { capability: () => capability };
}
