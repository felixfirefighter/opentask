import type { AuthenticatedActor } from "@/shared/auth/actor";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { parseTaskApiCreateKey, parseTaskApiResourceId } from "@/modules/tasks";
import { ApplicationError } from "@/shared/http/application-error";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";
import type { z } from "zod";

export const taskMutationBodyLimits = {
  organizer: 4_096,
  task: 98_304,
} as const;

export function taskApiResponse(
  request: Request,
  useCase: string,
  work: () => Response | Promise<Response>,
): Promise<Response> {
  return observeApiRequest(request, useCase, work);
}

export function resolveTaskApiActor(request: Request): Promise<AuthenticatedActor> {
  return resolveActor(request.headers);
}

export async function readTaskApiMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  options: {
    method?: "PATCH" | "POST";
    maxBytes?: number;
  } = {},
): Promise<{ actor: AuthenticatedActor; input: T }> {
  assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin, options.method ?? "POST");
  const actor = await resolveTaskApiActor(request);
  const input = schema.parse(
    await readBoundedJson(request, options.maxBytes ?? taskMutationBodyLimits.organizer),
  );
  return { actor, input };
}

export function parseTaskApiId(value: string): string {
  return parseTaskApiResourceId(value);
}

export function parseTaskApiCreateId(headers: Headers): string {
  return parseTaskApiCreateKey(headers.get("idempotency-key"));
}

export function parseTaskApiQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const values = Object.create(null) as Record<string, string>;
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key === "__proto__") {
      throw new ApplicationError("VALIDATION_FAILED", "The query parameter name is not allowed.");
    }
    if (Object.hasOwn(values, key)) {
      throw new ApplicationError("VALIDATION_FAILED", "A query parameter was provided more than once.");
    }
    values[key] = value;
  }
  return schema.parse(values);
}

export function assertNoTaskApiQuery(request: Request): void {
  if (new URL(request.url).searchParams.size > 0) {
    throw new ApplicationError("VALIDATION_FAILED", "This endpoint does not accept query parameters.");
  }
}

export function privateTaskJson(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

export function taskCreateJson<T>(
  result: Readonly<{ created: boolean; value: T }>,
  location: string,
): Response {
  return privateTaskJson(result.value, {
    status: result.created ? 201 : 200,
    ...(result.created ? { headers: { location } } : {}),
  });
}
