import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { habitIdSchema } from "@/modules/habits";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import { ApplicationError } from "@/shared/http/application-error";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";
import type { z } from "zod";

export const habitMutationBodyLimit = 16_384;

export function habitApiResponse(
  request: Request,
  useCase: string,
  work: () => Response | Promise<Response>,
): Promise<Response> {
  return observeApiRequest(request, useCase, work);
}

export function resolveHabitApiActor(request: Request): Promise<AuthenticatedActor> {
  return resolveActor(request.headers);
}

export async function readHabitApiMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  method: "PATCH" | "POST" = "POST",
): Promise<{ actor: AuthenticatedActor; input: T }> {
  assertTrustedJsonMutation(request, getIdentityRequestSecurity(), method);
  const actor = await resolveHabitApiActor(request);
  const input = schema.parse(await readBoundedJson(request, habitMutationBodyLimit));
  return { actor, input };
}

export function parseHabitApiId(value: string): string {
  return habitIdSchema.parse(value);
}

export function parseHabitApiCreateId(headers: Headers): string {
  const value = headers.get("idempotency-key");
  if (!value) {
    throw new ApplicationError("VALIDATION_FAILED", "An Idempotency-Key header is required.");
  }
  return habitIdSchema.parse(value);
}

export function parseHabitApiQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const values = Object.create(null) as Record<string, string>;
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key === "__proto__" || Object.hasOwn(values, key)) {
      throw new ApplicationError("VALIDATION_FAILED", "The query parameters are invalid.");
    }
    values[key] = value;
  }
  return schema.parse(values);
}

export function assertNoHabitApiQuery(request: Request): void {
  if (new URL(request.url).searchParams.size > 0) {
    throw new ApplicationError("VALIDATION_FAILED", "This endpoint does not accept query parameters.");
  }
}

export function privateHabitJson(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

export function habitCreateJson<T>(
  result: Readonly<{ created: boolean; value: T }>,
  location: string,
): Response {
  return privateHabitJson(result.value, {
    status: result.created ? 201 : 200,
    ...(result.created ? { headers: { location } } : {}),
  });
}
