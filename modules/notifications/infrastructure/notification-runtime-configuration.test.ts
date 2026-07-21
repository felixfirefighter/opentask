import { describe, expect, it } from "vitest";

import { parseNotificationConfiguration } from "./notification-configuration";
import { createNotificationRuntimeConfiguration } from "./notification-runtime-configuration";

const privateKey = Buffer.alloc(32, 7).toString("base64url");
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString("base64url");

describe("notification runtime capability", () => {
  it("reports only intentional browser-safe configuration", () => {
    const runtime = createNotificationRuntimeConfiguration(
      parseNotificationConfiguration({
        REMINDER_WORKER_MODE: "enabled",
        WEB_PUSH_VAPID_SUBJECT: "https://example.test/contact",
        WEB_PUSH_VAPID_PUBLIC_KEY: publicKey,
        WEB_PUSH_VAPID_PRIVATE_KEY: privateKey,
        PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION: "0",
        PUSH_SUBSCRIPTION_ENCRYPTION_KEYS: `0:${privateKey}`,
      }),
    );

    expect(runtime.capability()).toEqual({
      provider: "configured",
      storageEncryption: "configured",
      worker: "configured_unverified",
      vapidPublicKey: publicKey,
    });
    expect(JSON.stringify(runtime.capability())).not.toContain(privateKey);
  });

  it("reports optional absence and deliberate worker disablement honestly", () => {
    const absent = createNotificationRuntimeConfiguration(parseNotificationConfiguration({}));
    expect(absent.capability()).toEqual({
      provider: "unconfigured",
      storageEncryption: "unconfigured",
      worker: "unconfigured",
      vapidPublicKey: null,
    });
    const disabled = createNotificationRuntimeConfiguration(
      parseNotificationConfiguration({ REMINDER_WORKER_MODE: "disabled" }),
    );
    expect(disabled.capability().worker).toBe("known_disabled");
  });
});
