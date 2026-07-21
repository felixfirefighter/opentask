import { getEnvironment } from "@/shared/config/environment";
import type { Database } from "@/shared/db/client";

import { decryptOpenAIKey } from "./openai-credential-crypto";
import { createOpenAICredentialRepository } from "./openai-credential-repository";

const encryptionSecretFallback = "omplish-local-development-only-auth-secret";

export function getServerOpenAIKey(): string | null {
  const apiKey = getEnvironment().OPENAI_API_KEY?.trim();
  return apiKey || null;
}

export function getOpenAIEncryptionSecret(): string {
  return (
    getEnvironment().OPENAI_API_KEY_ENCRYPTION_KEY ??
    getEnvironment().BETTER_AUTH_SECRET ??
    encryptionSecretFallback
  );
}

export async function getOpenAIKeyForActor(database: Database, userId: string): Promise<string | null> {
  const credential = await createOpenAICredentialRepository(database).findByUserId(userId);
  if (credential) return decryptOpenAIKey(credential, getOpenAIEncryptionSecret());
  return getServerOpenAIKey();
}
