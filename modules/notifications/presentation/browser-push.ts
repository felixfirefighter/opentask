export type BrowserPushSnapshot = Readonly<{
  support: "supported" | "unsupported";
  permission: NotificationPermission | "unsupported";
  subscription: PushSubscription | null;
}>;

const BROWSER_PUSH_READY_TIMEOUT_MS = 5_000;

export async function inspectBrowserPush(): Promise<BrowserPushSnapshot> {
  if (!supportsBrowserPush()) {
    return { support: "unsupported", permission: "unsupported", subscription: null };
  }

  const registration = await readyServiceWorker();
  return {
    support: "supported",
    permission: Notification.permission,
    subscription: await registration.pushManager.getSubscription(),
  };
}

export async function requestBrowserPushSubscription(
  vapidPublicKey: string,
  resetCurrent: boolean,
): Promise<BrowserPushSnapshot> {
  if (!supportsBrowserPush()) return inspectBrowserPush();

  const registration = await readyServiceWorker();
  const current = await registration.pushManager.getSubscription();
  if (resetCurrent && current) await current.unsubscribe();

  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") {
    return { support: "supported", permission, subscription: null };
  }

  const existing = resetCurrent ? null : await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(vapidPublicKey),
    }));
  return { support: "supported", permission, subscription };
}

export async function unsubscribeBrowserPush(subscription: PushSubscription): Promise<void> {
  if (!(await subscription.unsubscribe())) {
    throw new Error("This browser did not remove its push subscription.");
  }
}

export function browserSubscriptionEnrollment(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  const endpoint = serialized.endpoint ?? subscription.endpoint;
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("This browser returned an incomplete push subscription.");
  }
  return { id: crypto.randomUUID(), endpoint, keys: { p256dh, auth } };
}

function supportsBrowserPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator
  );
}

async function readyServiceWorker(): Promise<ServiceWorkerRegistration> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("The service worker did not become ready for browser reminders.")),
          BROWSER_PUSH_READY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}
