import type { Page, Route } from "@playwright/test";

export const configuredPushCapability = {
  provider: "configured",
  storageEncryption: "configured",
  worker: "configured_unverified",
  // Deterministic uncompressed P-256 public key shape. The browser boundary only decodes it;
  // provider cryptography remains covered by the notification infrastructure tests.
  vapidPublicKey: "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
} as const;

const subscriptionFixture = {
  endpoint: "https://push.example.test/opentask-browser-fixture",
  p256dh: "A".repeat(87),
  auth: "B".repeat(22),
} as const;

export type BrowserPushMockSnapshot = Readonly<{
  permission: NotificationPermission;
  permissionRequests: number;
  subscribeCalls: number;
  subscribed: boolean;
  unsubscribeCalls: number;
}>;

export async function installBrowserPushMock(
  page: Page,
  initialPermission: NotificationPermission | "unsupported" = "default",
): Promise<void> {
  await page.addInitScript(
    ({ fixture, permission }) => {
      if (permission === "unsupported") {
        Reflect.deleteProperty(window, "Notification");
        Reflect.deleteProperty(window, "PushManager");
        return;
      }

      const initialState = {
        permission,
        permissionRequests: 0,
        subscribeCalls: 0,
        subscribed: permission === "granted",
        unsubscribeCalls: 0,
      };
      const storageKey = "opentask-browser-push-fixture-state";
      let savedState: Partial<typeof initialState> = {};
      try {
        savedState = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "{}") as Partial<
          typeof initialState
        >;
      } catch {
        // Opaque bootstrap documents cannot access storage. The app-origin document can.
      }
      const state = { ...initialState, ...savedState };
      const persist = () => {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(state));
        } catch {
          // The fixture still behaves correctly for the current document without storage.
        }
      };
      const subscription = {
        endpoint: fixture.endpoint,
        async unsubscribe() {
          state.unsubscribeCalls += 1;
          state.subscribed = false;
          persist();
          return true;
        },
        toJSON() {
          return {
            endpoint: fixture.endpoint,
            keys: { p256dh: fixture.p256dh, auth: fixture.auth },
          };
        },
      };
      const pushManager = {
        async getSubscription() {
          return state.subscribed ? subscription : null;
        },
        async subscribe() {
          state.subscribeCalls += 1;
          state.subscribed = true;
          persist();
          return subscription;
        },
      };

      class BrowserPushFixtureManager {}
      class BrowserPushFixtureNotification {}
      Object.defineProperty(BrowserPushFixtureNotification, "permission", {
        configurable: true,
        get: () => state.permission,
      });
      Object.defineProperty(BrowserPushFixtureNotification, "requestPermission", {
        configurable: true,
        value: async () => {
          state.permissionRequests += 1;
          if (state.permission === "default") state.permission = "granted";
          persist();
          return state.permission;
        },
      });
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: BrowserPushFixtureNotification,
      });
      Object.defineProperty(window, "PushManager", {
        configurable: true,
        value: BrowserPushFixtureManager,
      });
      Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
        configurable: true,
        get: () => pushManager,
      });
      Object.defineProperty(window, "__opentaskBrowserPushFixture", {
        configurable: true,
        value: {
          snapshot: () => ({ ...state }),
        },
      });
    },
    { fixture: subscriptionFixture, permission: initialPermission },
  );
}

export async function readBrowserPushMock(page: Page): Promise<BrowserPushMockSnapshot> {
  return page.evaluate(() => {
    const fixture = (
      window as typeof window & {
        __opentaskBrowserPushFixture?: { snapshot(): BrowserPushMockSnapshot };
      }
    ).__opentaskBrowserPushFixture;
    if (!fixture) throw new Error("The browser push fixture is not installed.");
    return fixture.snapshot();
  });
}

export async function mockPushCapability(
  page: Page,
  capability: Readonly<{
    provider: "configured" | "unconfigured";
    storageEncryption: "configured" | "unconfigured";
    worker: "configured_unverified" | "known_disabled" | "unconfigured";
    vapidPublicKey: string | null;
  }> = configuredPushCapability,
): Promise<void> {
  await page.route("**/api/v1/notifications/capability", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await fulfillJson(route, capability);
  });
}

export async function mockPushSubscriptionWrites(
  page: Page,
  registrationResults: readonly ("subscribed" | "subscription_reset_required")[] = ["subscribed"],
) {
  const registrations: unknown[] = [];
  const revocations: unknown[] = [];
  let registrationIndex = 0;

  await page.route("**/api/v1/notifications/subscriptions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    registrations.push(route.request().postDataJSON());
    const status = registrationResults[registrationIndex] ?? registrationResults.at(-1) ?? "subscribed";
    registrationIndex += 1;
    await fulfillJson(
      route,
      status === "subscribed"
        ? { status, subscriptionId: "33333333-3333-4333-8333-333333333333" }
        : { status },
    );
  });
  await page.route("**/api/v1/notifications/subscriptions/revoke", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    revocations.push(route.request().postDataJSON());
    await fulfillJson(route, { status: "revoked" });
  });

  return { registrations, revocations };
}

export function privatePushFixtureValues() {
  return subscriptionFixture;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
}
