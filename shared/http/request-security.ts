import { ApplicationError } from "./application-error";

export type TrustedOriginPolicy =
  Readonly<{ trustedOrigin: string }> | Readonly<{ trustedOrigins: readonly string[] }>;

export function assertTrustedJsonMutation(
  request: Request,
  policy: TrustedOriginPolicy,
  expectedMethod: "DELETE" | "PATCH" | "POST" = "POST",
) {
  if (request.method !== expectedMethod) throw validationFailure();
  assertJsonContentType(request.headers);

  const requestOrigin = normalizeOrigin(request.headers.get("origin"));
  const trustedOrigins = "trustedOrigins" in policy ? policy.trustedOrigins : [policy.trustedOrigin];
  if (
    requestOrigin === null ||
    !trustedOrigins.some((trustedOrigin) => normalizeOrigin(trustedOrigin) === requestOrigin)
  ) {
    throw new ApplicationError("FORBIDDEN", "This request origin is not allowed.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") {
    throw new ApplicationError("FORBIDDEN", "Cross-site mutations are not allowed.");
  }
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.origin === value ? parsed.origin : null;
  } catch {
    return null;
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer.");
  }
  assertJsonContentType(request.headers);
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > maxBytes) {
      throw validationFailure();
    }
  }

  const body = await readBoundedBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body), rejectUnsafeJsonKey) as unknown;
  } catch {
    throw validationFailure();
  }
}

function rejectUnsafeJsonKey(key: string, value: unknown): unknown {
  if (key === "__proto__") throw validationFailure();
  return value;
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        void reader.cancel("OpenTask request body limit exceeded").catch(() => undefined);
        throw validationFailure();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function assertJsonContentType(headers: Headers) {
  const mediaType = headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") throw validationFailure();
}

function validationFailure() {
  return new ApplicationError("VALIDATION_FAILED", "Review the submitted request and try again.");
}
