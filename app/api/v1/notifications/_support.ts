import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import { ApplicationError } from "@/shared/http/application-error";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";
import type { z } from "zod";

const notificationMutationBodyLimit = 16_384;

export function notificationApiResponse(
  request: Request,
  useCase: string,
  work: () => Response | Promise<Response>,
): Promise<Response> {
  return observeApiRequest(request, useCase, work);
}

export function resolveNotificationApiActor(request: Request): Promise<AuthenticatedActor> {
  return resolveActor(request.headers);
}

export async function readNotificationApiMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  method: "DELETE" | "POST" | "PUT",
): Promise<{ actor: AuthenticatedActor; input: T }> {
  assertTrustedJsonMutation(request, getIdentityRequestSecurity(), method);
  const actor = await resolveNotificationApiActor(request);
  const input = schema.parse(await readBoundedJson(request, notificationMutationBodyLimit));
  return { actor, input };
}

export function assertNoNotificationApiQuery(request: Request): void {
  if (new URL(request.url).searchParams.size > 0) {
    throw new ApplicationError("VALIDATION_FAILED", "This endpoint does not accept query parameters.");
  }
}

export function privateNotificationJson(value: unknown): Response {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}
