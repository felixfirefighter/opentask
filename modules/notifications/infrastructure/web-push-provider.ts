import webPush from "web-push";

import type { VapidConfiguration } from "./notification-configuration";
import {
  createPublicPushEgressGuard,
  type PushAddressResolver,
  UnsafePushEndpointError,
} from "./public-push-endpoint";

type WebPushSender = typeof webPush.sendNotification;
export type WebPushProviderResult =
  | Readonly<{ kind: "accepted" }>
  | Readonly<{ kind: "retryable"; code: string }>
  | Readonly<{ kind: "subscription_gone" }>
  | Readonly<{ kind: "permanent"; code: string }>
  | Readonly<{ kind: "outcome_unknown" }>;
export type WebPushProviderAdapter = Readonly<{
  configured: boolean;
  vapidPublicKey: string | null;
  send(
    input: Readonly<{
      endpoint: string;
      p256dh: string;
      auth: string;
      payload: Readonly<{ schemaVersion: 1; taskId: string; deliveryId: string }>;
      ttlSeconds: number;
      timeoutMs: number;
    }>,
  ): Promise<WebPushProviderResult>;
}>;
const WALL_CLOCK_TIMEOUT = Symbol("wall-clock-timeout");

export function createWebPushProvider(
  configuration: VapidConfiguration | null,
  sender: WebPushSender = webPush.sendNotification,
  resolver?: PushAddressResolver,
): WebPushProviderAdapter {
  return {
    configured: configuration !== null,
    vapidPublicKey: configuration?.publicKey ?? null,

    async send(input) {
      if (!configuration) return { kind: "permanent", code: "provider_unconfigured" };
      const payload = sanitizePushPayload(input.payload);
      if (!isValidProviderInput(input) || !payload) {
        return { kind: "permanent", code: "subscription_material_invalid" };
      }

      const deadlineController = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          deadlineController.abort(WALL_CLOCK_TIMEOUT);
          reject(WALL_CLOCK_TIMEOUT);
        }, input.timeoutMs);
        timer.unref?.();
      });
      const egress = createPublicPushEgressGuard(resolver, deadlineController.signal);
      try {
        await Promise.race([egress.assertEndpoint(input.endpoint), deadline]);
        deadlineController.signal.throwIfAborted();
        const result = await Promise.race([
          sender(
            {
              endpoint: input.endpoint,
              keys: { p256dh: input.p256dh, auth: input.auth },
            },
            JSON.stringify(payload),
            {
              vapidDetails: configuration,
              TTL: input.ttlSeconds,
              timeout: input.timeoutMs,
              contentEncoding: "aes128gcm",
              agent: egress.agent,
            },
          ),
          deadline,
        ]);
        return classifyStatus(result.statusCode);
      } catch (error) {
        if (error instanceof UnsafePushEndpointError) {
          return { kind: "permanent", code: "subscription_material_invalid" };
        }
        if (error === WALL_CLOCK_TIMEOUT) return { kind: "outcome_unknown" };
        return classifyProviderError(error);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

function classifyProviderError(error: unknown): WebPushProviderResult {
  const statusCode = readStatusCode(error);
  return statusCode === null || statusCode < 100 || statusCode > 599
    ? { kind: "outcome_unknown" }
    : classifyStatus(statusCode);
}

function classifyStatus(statusCode: number): WebPushProviderResult {
  if (statusCode >= 200 && statusCode <= 299) return { kind: "accepted" };
  if (statusCode === 404 || statusCode === 410) return { kind: "subscription_gone" };
  if (statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) {
    return { kind: "retryable", code: `provider_http_${statusCode}` };
  }
  return { kind: "permanent", code: `provider_http_${normalizedStatus(statusCode)}` };
}

function readStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && Number.isInteger(statusCode) ? statusCode : null;
}

function normalizedStatus(statusCode: number): string {
  return statusCode >= 100 && statusCode <= 999 ? String(statusCode) : "invalid_status";
}

function isValidProviderInput(
  input: Readonly<{
    endpoint: string;
    p256dh: string;
    auth: string;
    ttlSeconds: number;
    timeoutMs: number;
  }>,
): boolean {
  try {
    if (new URL(input.endpoint).protocol !== "https:") return false;
  } catch {
    return false;
  }
  return (
    isCanonicalBase64Url(input.p256dh, 65, 4) &&
    isCanonicalBase64Url(input.auth, 16) &&
    Number.isInteger(input.ttlSeconds) &&
    input.ttlSeconds >= 1 &&
    input.ttlSeconds <= 900 &&
    input.timeoutMs === 10_000
  );
}

function isCanonicalBase64Url(value: string, byteLength: number, firstByte?: number): boolean {
  try {
    const decoded = Buffer.from(value, "base64url");
    return (
      decoded.length === byteLength &&
      decoded.toString("base64url") === value &&
      (firstByte === undefined || decoded[0] === firstByte)
    );
  } catch {
    return false;
  }
}

function sanitizePushPayload(
  payload: Readonly<{ schemaVersion: 1; taskId: string; deliveryId: string }>,
): Readonly<{ schemaVersion: 1; taskId: string; deliveryId: string }> | null {
  const keys = Object.keys(payload).sort();
  if (keys.join(",") !== "deliveryId,schemaVersion,taskId" || payload.schemaVersion !== 1) return null;
  const taskId = canonicalUuid(payload.taskId);
  const deliveryId = canonicalUuid(payload.deliveryId);
  return taskId && deliveryId ? { schemaVersion: 1, taskId, deliveryId } : null;
}

function canonicalUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value.toLowerCase()
    : null;
}
