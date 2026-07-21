import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { SubscriptionEncryptionConfiguration } from "./notification-configuration";

const ENVELOPE_PATTERN = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/u;
export type SubscriptionCipherField = "endpoint" | "p256dh" | "auth";

export type AesSubscriptionCipher = Readonly<{
  configured: boolean;
  activeKeyVersion: number | null;
  encrypt(input: SubscriptionCipherInput & Readonly<{ plaintext: string }>): string;
  decrypt(input: SubscriptionCipherInput & Readonly<{ ciphertext: string }>): string;
}>;

type SubscriptionCipherInput = Readonly<{
  userId: string;
  subscriptionId: string;
  field: SubscriptionCipherField;
  keyVersion: number;
}>;

export class SubscriptionCipherError extends Error {
  constructor() {
    super("Subscription material could not be processed.");
    this.name = "SubscriptionCipherError";
  }
}

export function createAesSubscriptionCipher(
  configuration: SubscriptionEncryptionConfiguration | null,
  nonceSource: (size: number) => Buffer = randomBytes,
): AesSubscriptionCipher {
  return {
    configured: configuration !== null,
    activeKeyVersion: configuration?.activeKeyVersion ?? null,

    encrypt(input) {
      if (!configuration || input.keyVersion !== configuration.activeKeyVersion) {
        throw new SubscriptionCipherError();
      }
      const key = configuration.keys.get(input.keyVersion);
      if (!key || key.length !== 32 || input.plaintext.length === 0) {
        throw new SubscriptionCipherError();
      }

      try {
        const nonce = nonceSource(12);
        if (nonce.length !== 12) throw new SubscriptionCipherError();
        const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
        cipher.setAAD(subscriptionAad(input));
        const ciphertext = Buffer.concat([cipher.update(input.plaintext, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `v1.${nonce.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
      } catch (error) {
        if (error instanceof SubscriptionCipherError) throw error;
        throw new SubscriptionCipherError();
      }
    },

    decrypt(input) {
      if (!configuration) throw new SubscriptionCipherError();
      const key = configuration.keys.get(input.keyVersion);
      const envelope = ENVELOPE_PATTERN.exec(input.ciphertext);
      if (!key || key.length !== 32 || !envelope) throw new SubscriptionCipherError();

      try {
        const nonce = decodeCanonicalBase64Url(envelope[1]!, 12);
        const ciphertext = decodeCanonicalBase64Url(envelope[2]!);
        const tag = decodeCanonicalBase64Url(envelope[3]!, 16);
        if (ciphertext.length === 0) throw new SubscriptionCipherError();
        const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
        decipher.setAAD(subscriptionAad(input));
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const value = plaintext.toString("utf8");
        if (value.length === 0 || Buffer.from(value, "utf8").compare(plaintext) !== 0) {
          throw new SubscriptionCipherError();
        }
        return value;
      } catch (error) {
        if (error instanceof SubscriptionCipherError) throw error;
        throw new SubscriptionCipherError();
      }
    },
  };
}

function subscriptionAad(
  input: Readonly<{
    userId: string;
    subscriptionId: string;
    field: SubscriptionCipherField;
    keyVersion: number;
  }>,
): Buffer {
  return Buffer.from(
    ["opentask-push-subscription-v1", input.userId, input.subscriptionId, input.field, input.keyVersion].join(
      "\0",
    ),
    "utf8",
  );
}

function decodeCanonicalBase64Url(value: string, exactBytes?: number): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    (exactBytes !== undefined && decoded.length !== exactBytes)
  ) {
    throw new SubscriptionCipherError();
  }
  return decoded;
}
