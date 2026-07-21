import { describe, expect, it } from "vitest";

import { NotificationConfigurationError, parseNotificationConfiguration } from "./notification-configuration";

const privateKey = Buffer.alloc(32, 7).toString("base64url");
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString("base64url");

describe("notification configuration", () => {
  it("supports a completely absent optional provider", () => {
    expect(parseNotificationConfiguration({})).toEqual({
      workerMode: "unconfigured",
      vapid: null,
      subscriptionEncryption: null,
    });
  });

  it("parses exact enabled provider and versioned encryption values", () => {
    const configuration = parseNotificationConfiguration({
      REMINDER_WORKER_MODE: "enabled",
      WEB_PUSH_VAPID_SUBJECT: "mailto:operator@example.test",
      WEB_PUSH_VAPID_PUBLIC_KEY: publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: privateKey,
      PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION: "2",
      PUSH_SUBSCRIPTION_ENCRYPTION_KEYS: `1:${Buffer.alloc(32, 1).toString("base64url")},2:${privateKey}`,
    });

    expect(configuration.workerMode).toBe("enabled");
    expect(configuration.vapid).toEqual({
      subject: "mailto:operator@example.test",
      publicKey,
      privateKey,
    });
    expect(configuration.subscriptionEncryption?.activeKeyVersion).toBe(2);
    expect(configuration.subscriptionEncryption?.keys.get(2)).toEqual(Buffer.alloc(32, 7));
  });

  it("distinguishes an explicitly disabled worker", () => {
    expect(parseNotificationConfiguration({ REMINDER_WORKER_MODE: "disabled" }).workerMode).toBe("disabled");
  });

  it.each([
    [{ REMINDER_WORKER_MODE: "yes" }, ["REMINDER_WORKER_MODE"]],
    [
      { WEB_PUSH_VAPID_SUBJECT: "http://example.test", WEB_PUSH_VAPID_PUBLIC_KEY: publicKey },
      ["WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT"],
    ],
    [
      {
        WEB_PUSH_VAPID_SUBJECT: "mailto:operator@example.test",
        WEB_PUSH_VAPID_PUBLIC_KEY: "not-a-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: privateKey,
      },
      ["WEB_PUSH_VAPID_PUBLIC_KEY"],
    ],
    [{ PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION: "0" }, ["PUSH_SUBSCRIPTION_ENCRYPTION_KEYS"]],
    [
      {
        PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION: "2",
        PUSH_SUBSCRIPTION_ENCRYPTION_KEYS: `1:${privateKey}`,
      },
      ["PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION"],
    ],
    [
      {
        PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION: "1",
        PUSH_SUBSCRIPTION_ENCRYPTION_KEYS: `1:${privateKey},1:${privateKey}`,
      },
      ["PUSH_SUBSCRIPTION_ENCRYPTION_KEYS"],
    ],
    [
      {
        PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION: "01",
        PUSH_SUBSCRIPTION_ENCRYPTION_KEYS: `1:${privateKey}`,
      },
      ["PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION"],
    ],
  ] as const)("rejects malformed or partial groups without exposing values", (source, expectedFields) => {
    try {
      parseNotificationConfiguration(source);
      throw new Error("expected configuration error");
    } catch (error) {
      expect(error).toBeInstanceOf(NotificationConfigurationError);
      expect((error as NotificationConfigurationError).fields).toEqual(expectedFields);
      expect((error as Error).message).not.toContain(privateKey);
    }
  });
});
