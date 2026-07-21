import { describe, expect, it } from "vitest";

import { createAesSubscriptionCipher, SubscriptionCipherError } from "./aes-subscription-cipher";

const userId = "11111111-1111-4111-8111-111111111111";
const subscriptionId = "22222222-2222-4222-8222-222222222222";
const keys = new Map([
  [1, Buffer.alloc(32, 1)],
  [2, Buffer.alloc(32, 2)],
]);
const configuration = { activeKeyVersion: 2, keys } as const;
const nonce = Buffer.from("000102030405060708090a0b", "hex");

describe("AES subscription cipher", () => {
  it("creates the exact v1 AES-256-GCM envelope and round-trips active material", () => {
    const cipher = createAesSubscriptionCipher(configuration, () => nonce);
    const input = { userId, subscriptionId, field: "endpoint" as const, keyVersion: 2 };
    const ciphertext = cipher.encrypt({ ...input, plaintext: "https://push.example.test/opaque" });

    expect(cipher.configured).toBe(true);
    expect(cipher.activeKeyVersion).toBe(2);
    expect(ciphertext).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/u);
    expect(cipher.decrypt({ ...input, ciphertext })).toBe("https://push.example.test/opaque");
  });

  it("retains old keys for decryption but encrypts only with the active version", () => {
    const old = createAesSubscriptionCipher({ activeKeyVersion: 1, keys }, () => nonce);
    const ciphertext = old.encrypt({
      userId,
      subscriptionId,
      field: "auth",
      keyVersion: 1,
      plaintext: "old-auth",
    });
    const rotated = createAesSubscriptionCipher(configuration, () => nonce);

    expect(rotated.decrypt({ userId, subscriptionId, field: "auth", keyVersion: 1, ciphertext })).toBe(
      "old-auth",
    );
    expect(() =>
      rotated.encrypt({ userId, subscriptionId, field: "auth", keyVersion: 1, plaintext: "new" }),
    ).toThrow(SubscriptionCipherError);
  });

  it("binds every protected identity and field through authenticated AAD", () => {
    const cipher = createAesSubscriptionCipher(configuration, () => nonce);
    const ciphertext = cipher.encrypt({
      userId,
      subscriptionId,
      field: "p256dh",
      keyVersion: 2,
      plaintext: "key-material",
    });

    for (const hostile of [
      { userId: "33333333-3333-4333-8333-333333333333", subscriptionId, field: "p256dh" as const },
      { userId, subscriptionId: "33333333-3333-4333-8333-333333333333", field: "p256dh" as const },
      { userId, subscriptionId, field: "auth" as const },
    ]) {
      expect(() => cipher.decrypt({ ...hostile, keyVersion: 2, ciphertext })).toThrow(
        SubscriptionCipherError,
      );
    }
  });

  it("fails closed with a sanitized error for absent keys or tampering", () => {
    const absent = createAesSubscriptionCipher(null);
    expect(absent.configured).toBe(false);
    expect(absent.activeKeyVersion).toBeNull();
    expect(() =>
      absent.encrypt({
        userId,
        subscriptionId,
        field: "auth",
        keyVersion: 0,
        plaintext: "secret material",
      }),
    ).toThrow("Subscription material could not be processed.");

    const cipher = createAesSubscriptionCipher(configuration, () => nonce);
    const encrypted = cipher.encrypt({
      userId,
      subscriptionId,
      field: "auth",
      keyVersion: 2,
      plaintext: "secret material",
    });
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    expect(() =>
      cipher.decrypt({
        userId,
        subscriptionId,
        field: "auth",
        keyVersion: 2,
        ciphertext: tampered,
      }),
    ).toThrow("Subscription material could not be processed.");
  });
});
