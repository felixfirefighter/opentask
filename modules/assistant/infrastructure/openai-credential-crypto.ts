import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const initializationVectorBytes = 12;
const encryptionVersion = 1 as const;

export type EncryptedOpenAIKey = Readonly<{
  encryptedApiKey: string;
  initializationVector: string;
  authenticationTag: string;
  encryptionVersion: typeof encryptionVersion;
}>;

export function encryptOpenAIKey(apiKey: string, secret: string): EncryptedOpenAIKey {
  const initializationVector = randomBytes(initializationVectorBytes);
  const cipher = createCipheriv(algorithm, deriveKey(secret), initializationVector);
  const encryptedApiKey = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    encryptedApiKey: encryptedApiKey.toString("base64url"),
    initializationVector: initializationVector.toString("base64url"),
    authenticationTag: cipher.getAuthTag().toString("base64url"),
    encryptionVersion,
  };
}

export function decryptOpenAIKey(
  credential: Omit<EncryptedOpenAIKey, "encryptionVersion"> & { encryptionVersion: number },
  secret: string,
): string {
  if (credential.encryptionVersion !== encryptionVersion) {
    throw new Error(`Unsupported OpenAI credential encryption version: ${credential.encryptionVersion}`);
  }
  const decipher = createDecipheriv(
    algorithm,
    deriveKey(secret),
    Buffer.from(credential.initializationVector, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(credential.authenticationTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(credential.encryptedApiKey, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function deriveKey(secret: string): Buffer {
  if (secret.trim().length < 32) throw new Error("OpenAI credential encryption secret is too short.");
  return createHash("sha256").update(secret, "utf8").digest();
}
