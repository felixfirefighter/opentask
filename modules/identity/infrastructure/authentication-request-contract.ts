import { z } from "zod";

import { ApplicationError } from "@/shared/http/application-error";
import { readBoundedJson } from "@/shared/http/request-security";

import { isDemoAccountEmail } from "./demo-account-policy";

const maximumAuthRequestBytes = 1024;
const authApiPath = "/api/auth";

const emailSchema = z.string().trim().max(254).email();
const passwordSchema = z.string().min(8).max(128);
const credentialsSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});
const signUpCredentialsSchema = credentialsSchema.refine(
  ({ email }) => !isDemoAccountEmail(email),
  "That email address is reserved.",
);
const emptyBodySchema = z.strictObject({});
const publicPostPaths = new Set([
  `${authApiPath}/sign-up/email`,
  `${authApiPath}/sign-in/email`,
  `${authApiPath}/sign-out`,
]);

export async function preparePublicAuthRequest(request: Request): Promise<Request> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === `${authApiPath}/get-session`) {
    const contentLength = request.headers.get("content-length");
    if (url.search !== "" || (contentLength !== null && contentLength !== "0")) {
      throw invalidRequest();
    }
    return request;
  }

  if (request.method !== "POST" || !publicPostPaths.has(url.pathname)) throw endpointNotFound();
  if (url.search !== "") throw invalidRequest();

  const input = await readBoundedJson(request, maximumAuthRequestBytes);
  if (url.pathname === `${authApiPath}/sign-up/email`) {
    const credentials = signUpCredentialsSchema.parse(input);
    return replaceJsonBody(request, { ...credentials, name: "Omplish user" });
  }
  if (url.pathname === `${authApiPath}/sign-in/email`) {
    return replaceJsonBody(request, credentialsSchema.parse(input));
  }
  if (url.pathname === `${authApiPath}/sign-out`) {
    return replaceJsonBody(request, emptyBodySchema.parse(input));
  }

  throw endpointNotFound();
}

function replaceJsonBody(request: Request, body: Record<string, unknown>): Request {
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: request.signal,
  });
}

function endpointNotFound() {
  return new ApplicationError("NOT_FOUND", "Authentication endpoint not found.");
}

function invalidRequest() {
  return new ApplicationError("VALIDATION_FAILED", "Review the submitted request and try again.");
}
