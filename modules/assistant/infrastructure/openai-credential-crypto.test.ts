import { describe, expect, it } from "vitest";

import { decryptOpenAIKey, encryptOpenAIKey } from "./openai-credential-crypto";

describe("OpenAI credential encryption", () => {
  it("round-trips a key without storing plaintext in the encrypted fields", () => {
    const apiKey = "sk-test-secret-value";
    const credential = encryptOpenAIKey(apiKey, "a-test-encryption-secret-with-at-least-32-chars");

    expect(decryptOpenAIKey(credential, "a-test-encryption-secret-with-at-least-32-chars")).toBe(apiKey);
    expect(JSON.stringify(credential)).not.toContain(apiKey);
  });

  it("rejects tampered ciphertext and the wrong secret", () => {
    const credential = encryptOpenAIKey(
      "sk-test-secret-value",
      "a-test-encryption-secret-with-at-least-32-chars",
    );
    const tampered = { ...credential, encryptedApiKey: `${credential.encryptedApiKey}x` };

    expect(() => decryptOpenAIKey(tampered, "a-test-encryption-secret-with-at-least-32-chars")).toThrow();
    expect(() =>
      decryptOpenAIKey(credential, "a-different-encryption-secret-with-at-least-32-chars"),
    ).toThrow();
  });
});
