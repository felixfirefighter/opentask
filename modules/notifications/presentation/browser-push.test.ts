import { afterEach, describe, expect, it, vi } from "vitest";

import {
  browserSubscriptionEnrollment,
  inspectBrowserPush,
  requestBrowserPushSubscription,
  unsubscribeBrowserPush,
} from "./browser-push";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser push boundary", () => {
  it("reports unsupported without requesting permission", async () => {
    vi.stubGlobal("Notification", undefined);
    const requestPermission = vi.fn();

    await expect(inspectBrowserPush()).resolves.toEqual({
      support: "unsupported",
      permission: "unsupported",
      subscription: null,
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("inspection never prompts and returns the current browser subscription", async () => {
    const subscription = pushSubscription();
    const requestPermission = installSupportedBrowser({ subscription });

    await expect(inspectBrowserPush()).resolves.toMatchObject({
      support: "supported",
      permission: "default",
      subscription,
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("leaves checking with an error when the service worker never becomes ready", async () => {
    vi.useFakeTimers();
    installSupportedBrowser({ ready: new Promise<ServiceWorkerRegistration>(() => undefined) });

    const inspection = inspectBrowserPush();
    await vi.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void inspection.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(inspection).rejects.toThrow("did not become ready");
  });

  it("surfaces a failed service-worker readiness check", async () => {
    installSupportedBrowser({ ready: Promise.reject(new Error("registration failed")) });

    await expect(inspectBrowserPush()).rejects.toThrow("registration failed");
  });

  it("requests permission only inside the explicit enrollment operation", async () => {
    const subscribe = vi.fn(async () => pushSubscription());
    const requestPermission = installSupportedBrowser({ subscribe, permissionResult: "granted" });

    const result = await requestBrowserPushSubscription("BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", false);

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(result.permission).toBe("granted");
    expect(result.subscription).not.toBeNull();
  });

  it("does not subscribe when permission remains denied", async () => {
    const subscribe = vi.fn(async () => pushSubscription());
    const requestPermission = installSupportedBrowser({ subscribe, permissionResult: "denied" });

    await expect(
      requestBrowserPushSubscription("BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", false),
    ).resolves.toEqual({ support: "supported", permission: "denied", subscription: null });
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("rejects incomplete browser subscription material before registration", () => {
    expect(() =>
      browserSubscriptionEnrollment(pushSubscription({ endpoint: "https://push.invalid/incomplete" })),
    ).toThrow("incomplete push subscription");
  });

  it("treats a browser refusal to unsubscribe as a failed cleanup", async () => {
    const subscription = pushSubscription();
    subscription.unsubscribe = vi.fn(async () => false);

    await expect(unsubscribeBrowserPush(subscription)).rejects.toThrow("did not remove");
  });
});

function installSupportedBrowser({
  ready,
  subscription = null,
  subscribe = vi.fn(async () => pushSubscription()),
  permissionResult = "default" as NotificationPermission,
}: Readonly<{
  subscription?: PushSubscription | null;
  subscribe?: ReturnType<typeof vi.fn<() => Promise<PushSubscription>>>;
  permissionResult?: NotificationPermission;
  ready?: Promise<ServiceWorkerRegistration>;
}> = {}) {
  const requestPermission = vi.fn(async () => permissionResult);
  class TestNotification {
    static permission: NotificationPermission = "default";
    static requestPermission = requestPermission;
  }
  vi.stubGlobal("Notification", TestNotification);
  vi.stubGlobal("PushManager", class TestPushManager {});
  vi.stubGlobal("navigator", {
    serviceWorker: {
      ready:
        ready ??
        Promise.resolve({
          pushManager: {
            getSubscription: vi.fn(async () => subscription),
            subscribe,
          },
        }),
    },
  });
  return requestPermission;
}

function pushSubscription(
  serialized: Readonly<{
    endpoint?: string;
    keys?: Readonly<{ p256dh: string; auth: string }>;
  }> = {
    endpoint: "https://push.invalid/subscription",
    keys: { p256dh: "public-key", auth: "auth-secret" },
  },
): PushSubscription {
  return {
    endpoint: serialized.endpoint ?? "https://push.invalid/subscription",
    toJSON: () => serialized,
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription;
}
