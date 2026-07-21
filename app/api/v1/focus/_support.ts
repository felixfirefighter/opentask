import {
  focusIdSchema,
  focusStartInputSchema,
  type FocusStartInput,
  type FocusStartRequest,
  type FocusStartResult,
} from "@/modules/focus";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import { ApplicationError } from "@/shared/http/application-error";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";
import type { z } from "zod";

export const focusMutationBodyLimit = 4_096;

export function focusApiResponse(
  request: Request,
  useCase: string,
  work: () => Response | Promise<Response>,
): Promise<Response> {
  return observeApiRequest(request, useCase, work);
}

export function resolveFocusApiActor(request: Request): Promise<AuthenticatedActor> {
  return resolveActor(request.headers);
}

export async function readFocusApiMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  method: "DELETE" | "PATCH" | "POST" = "POST",
): Promise<{ actor: AuthenticatedActor; input: T }> {
  assertTrustedJsonMutation(request, getIdentityRequestSecurity(), method);
  const actor = await resolveFocusApiActor(request);
  const input = schema.parse(await readBoundedJson(request, focusMutationBodyLimit));
  return { actor, input };
}

export function combineFocusStartInput(id: string, request: FocusStartRequest): FocusStartInput {
  return focusStartInputSchema.parse({ id, ...request });
}

export function parseFocusApiId(value: string): string {
  return focusIdSchema.parse(value);
}

export function parseFocusApiCreateId(headers: Headers): string {
  const value = headers.get("idempotency-key");
  if (!value) {
    throw new ApplicationError("VALIDATION_FAILED", "An Idempotency-Key header is required.");
  }
  return parseFocusApiId(value);
}

export function parseFocusApiQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const values = Object.create(null) as Record<string, string>;
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key === "__proto__" || Object.hasOwn(values, key)) {
      throw new ApplicationError("VALIDATION_FAILED", "The query parameters are invalid.");
    }
    values[key] = value;
  }
  return schema.parse(values);
}

export function assertNoFocusApiQuery(request: Request): void {
  if (new URL(request.url).searchParams.size > 0) {
    throw new ApplicationError("VALIDATION_FAILED", "This endpoint does not accept query parameters.");
  }
}

export function privateFocusJson(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

export function focusStartJson(result: FocusStartResult): Response {
  const created = result.outcome === "created";
  return privateFocusJson(result, {
    status: created ? 201 : 200,
    ...(created ? { headers: { location: `/api/v1/focus/sessions/${result.snapshot.session.id}` } } : {}),
  });
}
