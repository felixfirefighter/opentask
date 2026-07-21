import type { AuthenticatedActor } from "@/shared/auth/actor";
import { getDatabase } from "@/shared/db/client";
import { z } from "zod";

import { decryptOpenAIKey, encryptOpenAIKey } from "../infrastructure/openai-credential-crypto";
import { getOpenAIEncryptionSecret, getServerOpenAIKey } from "../infrastructure/openai-credential-config";
import { createOpenAICredentialRepository } from "../infrastructure/openai-credential-repository";

export const openAISettingsSchema = z.strictObject({
  configured: z.boolean(),
  source: z.enum(["account", "server", "none"]),
});

export type OpenAISettings = z.infer<typeof openAISettingsSchema>;

export const openAIKeyFailureSchema = z.enum(["invalid", "network", "timeout", "unknown"]);
export type OpenAIKeyFailure = z.infer<typeof openAIKeyFailureSchema>;

export type OpenAIKeyVerification = Readonly<{ ok: true } | { ok: false; reason: OpenAIKeyFailure }>;

export async function getOpenAISettings(actor: AuthenticatedActor): Promise<OpenAISettings> {
  const credential = await createOpenAICredentialRepository(getDatabase()).findByUserId(actor.userId);
  if (credential) {
    decryptOpenAIKey(credential, getEncryptionSecret());
    return { configured: true, source: "account" };
  }
  if (getServerOpenAIKey()) return { configured: true, source: "server" };
  return { configured: false, source: "none" };
}

export async function updateOpenAIKey(
  actor: AuthenticatedActor,
  rawApiKey: string | null,
): Promise<OpenAISettings> {
  const repository = createOpenAICredentialRepository(getDatabase());
  const apiKey = rawApiKey?.trim() ?? "";
  if (apiKey.length === 0) {
    await repository.delete(actor.userId);
  } else {
    await repository.save(actor.userId, encryptOpenAIKey(apiKey, getEncryptionSecret()));
  }
  return getOpenAISettings(actor);
}

export async function saveOpenAIKey(
  actor: AuthenticatedActor,
  rawApiKey: string,
): Promise<OpenAIKeyVerification> {
  const apiKey = rawApiKey.trim();
  const firstCheck = await verifyOpenAIKey(apiKey);
  if (!firstCheck.ok) return firstCheck;

  // Verify immediately before persistence as a second write-boundary check. The key is never
  // included in the returned object or in an application log.
  const secondCheck = await verifyOpenAIKey(apiKey);
  if (!secondCheck.ok) return secondCheck;
  await createOpenAICredentialRepository(getDatabase()).save(
    actor.userId,
    encryptOpenAIKey(apiKey, getEncryptionSecret()),
  );
  return { ok: true };
}

export async function verifyOpenAIKey(apiKey: string): Promise<OpenAIKeyVerification> {
  if (apiKey.trim().length === 0) return { ok: false, reason: "invalid" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (response.status === 200) return { ok: true };
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "network" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getEncryptionSecret(): string {
  return getOpenAIEncryptionSecret();
}
